const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const City = require('../models/City');
const Company = require('../models/Company');
const Office = require('../models/Office');
const UncertainMerge = require('../models/UncertainMerge');
const Job = require('../models/Job');
const {
  extractDomain,
  normalizeCompanyName,
  slugify,
  stringSimilarity,
  linkJobsForCompany
} = require('../utils/companyUtils');

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV parser handling quotes
    const values = [];
    let insideQuote = false;
    let currentVal = '';

    for (let char of rawLine) {
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentVal.trim().replace(/^["']|["']$/g, ''));
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim().replace(/^["']|["']$/g, ''));

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

async function getUniqueSlug(baseName) {
  let baseSlug = slugify(baseName) || 'company';
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = await Company.findOne({ slug });
    if (!existing) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

async function importCsv(filePath) {
  console.log('========================================');
  console.log(`Manual CSV Importer: ${filePath}`);
  console.log('========================================');

  if (!fs.existsSync(filePath)) {
    console.error(`[Error] File not found: ${filePath}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected to MongoDB');

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(fileContent);
  const fileName = path.basename(filePath);

  console.log(`[Info] Parsed ${rows.length} rows from CSV.\n`);

  let createdCount = 0;
  let updatedCount = 0;
  let mergedCount = 0;
  let uncertainMerges = 0;
  let jobsLinked = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row.name || '').trim();
    const website = (row.website || '').trim();
    const cityName = (row.city || '').trim();
    const address = (row.address || '').trim();
    const notes = (row.notes || '').trim();

    if (!name) {
      console.warn(`[Row ${i + 1}] Missing company name. Skipping.`);
      continue;
    }

    const domain = extractDomain(website);
    const sourceUrl = `manual_csv:${fileName}#row-${i + 2}`;

    // Resolve City
    let cityRecord = null;
    if (cityName) {
      cityRecord = await City.findOne({
        $or: [
          { slug: slugify(cityName) },
          { name: new RegExp(`^${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        ]
      });

      if (!cityRecord) {
        console.log(`[City] City "${cityName}" not in DB. Creating active city...`);
        cityRecord = await City.create({
          name: cityName,
          slug: slugify(cityName),
          state: 'India',
          bbox: [0, 0, 0, 0], // placeholder bbox for manually added city
          active: true
        });
      }
    }

    // Deduplication Logic
    // 1. Dedupe by domain first
    let matchedCompany = null;
    if (domain) {
      matchedCompany = await Company.findOne({ domain });
    }

    // 2. Dedupe by normalized name + city
    const normalizedInput = normalizeCompanyName(name);
    if (!matchedCompany && cityRecord && normalizedInput.length >= 3) {
      // Find companies that have an office in this city
      const cityOffices = await Office.find({ cityId: cityRecord._id }).populate('companyId');
      for (const off of cityOffices) {
        const cand = off.companyId;
        if (!cand) continue;

        const candNorm = normalizeCompanyName(cand.name);
        const sim = stringSimilarity(normalizedInput, candNorm);

        if (candNorm === normalizedInput || sim >= 0.9) {
          if (cand.domain && domain && cand.domain !== domain) {
            // Uncertain merge
            console.log(`  [Uncertain Merge] "${cand.name}" (${cand.domain}) vs "${name}" (${domain})`);
            await UncertainMerge.create({
              companyA: cand._id,
              companyB: cand._id,
              reason: `CSV import match conflict between "${cand.name}" (${cand.domain}) and "${name}" (${domain})`,
              similarityScore: sim
            });
            uncertainMerges++;
          } else {
            matchedCompany = cand;
            break;
          }
        }
      }
    }

    // Also check exact name if no city office matched
    if (!matchedCompany) {
      matchedCompany = await Company.findOne({
        name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
    }

    let companyRecord = matchedCompany;

    if (companyRecord) {
      console.log(`[Row ${i + 1}] Matched existing company: "${companyRecord.name}"`);
      let isUpdated = false;

      if (!companyRecord.sources.includes(sourceUrl)) {
        companyRecord.sources.push(sourceUrl);
        isUpdated = true;
      }
      if (!companyRecord.website && website) {
        companyRecord.website = website;
        if (domain) companyRecord.domain = domain;
        isUpdated = true;
      }
      if (notes && !companyRecord.notes.includes(notes)) {
        companyRecord.notes = companyRecord.notes ? `${companyRecord.notes}\n${notes}` : notes;
        isUpdated = true;
      }

      if (isUpdated) {
        await companyRecord.save();
        updatedCount++;
      } else {
        mergedCount++;
      }
    } else {
      console.log(`[Row ${i + 1}] Creating new company: "${name}"`);
      const slug = await getUniqueSlug(name);
      const newCompData = {
        name,
        slug,
        category: 'Company',
        isTech: false,
        techEvidence: [],
        sources: [sourceUrl],
        notes,
        followUpStatus: 'to_contact',
        enrichmentStatus: 'pending'
      };
      if (website) newCompData.website = website;
      if (domain) newCompData.domain = domain;

      companyRecord = new Company(newCompData);
      await companyRecord.save();
      createdCount++;

      // Link any existing jobs
      const linked = await linkJobsForCompany(companyRecord, Job);
      jobsLinked += linked;
    }

    // Add Office if address and city are present
    if (cityRecord && address) {
      const existingOffice = await Office.findOne({
        companyId: companyRecord._id,
        cityId: cityRecord._id,
        $or: [
          { address: address },
          { addressSource: sourceUrl }
        ]
      });

      if (!existingOffice) {
        await Office.create({
          companyId: companyRecord._id,
          cityId: cityRecord._id,
          address,
          locality: '',
          lat: null,
          lng: null,
          addressSource: sourceUrl,
          addressType: 'unknown',
          verified: false
        });
        console.log(`  -> Created office in ${cityRecord.name}: "${address}"`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`CSV Import Summary:`);
  console.log(`- Created Companies:  ${createdCount}`);
  console.log(`- Updated Companies:  ${updatedCount}`);
  console.log(`- Deduplicated/Merged:${mergedCount}`);
  console.log(`- Uncertain Merges:   ${uncertainMerges}`);
  console.log(`- Jobs Linked:        ${jobsLinked}`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
}

const inputCsv = process.argv[2] || path.join(__dirname, '../data/manual_companies.csv');
importCsv(inputCsv).catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
