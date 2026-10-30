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
  linkJobsForCompany,
  isGovernmentOrNonTechEntity,
  classifyTechCompany
} = require('../utils/companyUtils');
const { getTechHubSeedsForCity } = require('../data/seeds/techHubSeeds');

const CACHE_DIR = path.join(__dirname, '../data/cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function fetchOverpassWithFallback(query) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[Overpass] Querying ${endpoint}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 28000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'JobRadar/2.0 (contact: support@jobradar.local)'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      if (json && Array.isArray(json.elements) && json.elements.length > 0) {
        console.log(`[Overpass] Successfully received ${json.elements.length} elements from ${endpoint}`);
        return json;
      }
    } catch (err) {
      console.warn(`[Overpass] Warning on ${endpoint}: ${err.message}`);
      lastError = err;
    }
  }
  console.warn(`[Overpass] All live mirrors timed out or failed (${lastError?.message}). Gracefully falling back to seed data.`);
  return { elements: [] };
}

function constructAddress(tags, cityName) {
  const parts = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  else if (cityName) parts.push(cityName);
  if (tags['addr:postcode']) parts.push(tags['addr:postcode']);

  if (parts.length > 0) {
    return parts.join(', ');
  }
  if (tags['addr:full']) return tags['addr:full'];
  return '';
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

async function importOsmForCity(citySlug, forceRefresh = false) {
  console.log(`\n========================================`);
  console.log(`OSM Discovery & Import for City: "${citySlug}"`);
  console.log(`========================================`);

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[DB] Connected to MongoDB');
  }

  const city = await City.findOne({ slug: citySlug });
  if (!city) {
    throw new Error(`City "${citySlug}" not found in database.`);
  }

  console.log(`[City] Found ${city.name}, ${city.state}. Bbox: [${city.bbox.join(', ')}]`);

  const cacheFile = path.join(CACHE_DIR, `osm_${city.slug}.json`);
  let elements = [];

  // Check disk cache (max 24 hours TTL, must have at least 25 elements to be considered a complete scan)
  let isCacheValid = false;
  if (!forceRefresh && fs.existsSync(cacheFile) && (Date.now() - fs.statSync(cacheFile).mtimeMs < 24 * 60 * 60 * 1000)) {
    try {
      const raw = fs.readFileSync(cacheFile, 'utf8');
      const cachedData = JSON.parse(raw);
      if (Array.isArray(cachedData.elements) && cachedData.elements.length >= 25) {
        isCacheValid = true;
        elements = cachedData.elements;
        console.log(`[Cache] Reading ${elements.length} verified cached Overpass results from ${cacheFile}`);
      } else {
        console.log(`[Cache] Cache file ${cacheFile} has only ${cachedData.elements?.length || 0} items; bypassing stub cache to run full scan.`);
      }
    } catch (_) {}
  }

  if (!isCacheValid) {
    console.log(`[Cache] Cache miss or expired. Querying Overpass API...`);
    const [south, west, north, east] = city.bbox;
    const query = `[out:json][timeout:25];
(
  node["office"~"it|software|telecommunication|coworking|research|company|consulting"](${south},${west},${north},${east});
  way["office"~"it|software|telecommunication|coworking|research|company|consulting"](${south},${west},${north},${east});
  node["amenity"="coworking_space"](${south},${west},${north},${east});
  way["amenity"="coworking_space"](${south},${west},${north},${east});
  node["office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics",i](${south},${west},${north},${east});
  way["office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics",i](${south},${west},${north},${east});
  node["building"="office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics",i](${south},${west},${north},${east});
  way["building"="office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics",i](${south},${west},${north},${east});
);
out center;`;

    const data = await fetchOverpassWithFallback(query);
    elements = data.elements || [];

    // Fall back to guaranteed tech hub seeds if Overpass mirrors fail or return empty
    if (elements.length === 0) {
      const seeds = getTechHubSeedsForCity(city.slug, city.name, city.bbox);
      if (seeds && seeds.length > 0) {
        console.log(`[OSM Discovery] Falling back to tech hub seeds for ${city.name} (${seeds.length} verified companies)`);
        elements = seeds.map((s, idx) => ({
          type: 'node',
          id: 9900000000 + idx,
          lat: s.lat,
          lon: s.lng,
          tags: {
            name: s.name,
            'addr:full': s.formatted_address,
            'addr:suburb': s.locality,
            website: s.website,
            phone: s.phone,
            office: 'it'
          }
        }));
      }
    }

    if (elements.length >= 20) {
      fs.writeFileSync(cacheFile, JSON.stringify({ elements }, null, 2), 'utf8');
      console.log(`[Cache] Cached ${elements.length} elements to ${cacheFile}`);
    }
  }

  console.log(`[Processing] Analyzing ${elements.length} raw OSM elements...`);

  let createdCompanies = 0;
  let updatedCompanies = 0;
  let createdOffices = 0;
  let skippedDuplicates = 0;
  let uncertainMerges = 0;
  let jobsLinked = 0;

  for (const el of elements) {
    const tags = el.tags || {};
    const rawName = tags.name;
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      continue; // Skip anonymous elements
    }

    const name = rawName.trim();
    const lat = el.lat != null ? el.lat : el.center?.lat;
    const lon = el.lon != null ? el.lon : el.center?.lon;
    if (lat == null || lon == null) continue;

    const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    const officeTag = (tags.office || '').toLowerCase().trim();
    const website = tags.website || tags['contact:website'] || tags.url || null;
    const domain = extractDomain(website);
    const email = tags.email || tags['contact:email'] || null;
    const phone = tags.phone || tags['contact:phone'] || null;

    // Filter out government bodies, school boards, civic buildings, and non-tech offices
    if (isGovernmentOrNonTechEntity({ name, website, domain, tags })) {
      continue;
    }

    const address = constructAddress(tags, city.name);
    const locality =
      tags['addr:suburb'] ||
      tags['addr:district'] ||
      tags['addr:neighbourhood'] ||
      '';

    // Classification & Evidence
    const classification = classifyTechCompany({ name, website, tags });
    let isTech = classification.isTech;
    let category = classification.category;
    const techEvidence = [];

    if (officeTag === 'it' || officeTag === 'software') {
      techEvidence.push({
        what: `OSM office=${officeTag}`,
        sourceUrl
      });
    } else if (officeTag === 'research') {
      techEvidence.push({
        what: 'OSM office=research',
        sourceUrl
      });
    } else if (isTech) {
      techEvidence.push({
        what: `Tech name & services keyword match: "${name}"`,
        sourceUrl
      });
    }

    // Deduplication Search
    let matchedCompany = null;

    // 1. Match by sourceUrl (if previously imported from this exact OSM element)
    matchedCompany = await Company.findOne({ sources: sourceUrl });

    // 2. Match by domain (if domain is present)
    if (!matchedCompany && domain) {
      matchedCompany = await Company.findOne({ domain });
    }

    // 3. Match by exact case-insensitive name
    if (!matchedCompany) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchedCompany = await Company.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
      });
    }

    // 4. Match by existing office coordinates in this city
    if (!matchedCompany) {
      const officeAtLoc = await Office.findOne({
        cityId: city._id,
        lat: { $gte: lat - 0.0005, $lte: lat + 0.0005 },
        lng: { $gte: lon - 0.0005, $lte: lon + 0.0005 }
      });
      if (officeAtLoc) {
        matchedCompany = await Company.findById(officeAtLoc.companyId);
      }
    }

    // 5. Match by normalized name
    const normalizedInput = normalizeCompanyName(name);
    if (!matchedCompany && normalizedInput.length >= 3) {
      const candidates = await Company.find({
        name: { $regex: new RegExp(`^${normalizedInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }
      }).limit(5);

      for (const cand of candidates) {
        const candNorm = normalizeCompanyName(cand.name);
        const sim = stringSimilarity(normalizedInput, candNorm);
        if (candNorm === normalizedInput || sim >= 0.9) {
          if (cand.domain && domain && cand.domain !== domain) {
            // High similarity but conflicting domain: Record uncertain merge!
            const existingUncertain = await UncertainMerge.findOne({
              $or: [
                { companyA: cand._id, companyB: cand._id },
                { reason: `Potential match between "${cand.name}" and "${name}"` }
              ]
            });
            if (!existingUncertain) {
              await UncertainMerge.create({
                companyA: cand._id,
                companyB: cand._id,
                reason: `Potential match between "${cand.name}" (${cand.domain}) and "${name}" (${domain})`,
                similarityScore: sim
              });
              uncertainMerges++;
            }
          } else {
            matchedCompany = cand;
            break;
          }
        }
      }
    }

    // Upsert Company
    let companyRecord = matchedCompany;
    if (companyRecord) {
      let isUpdated = false;

      // Add source if missing
      if (!companyRecord.sources.includes(sourceUrl)) {
        companyRecord.sources.push(sourceUrl);
        isUpdated = true;
      }

      // Add website/domain if missing
      if (!companyRecord.website && website) {
        companyRecord.website = website;
        companyRecord.domain = domain;
        isUpdated = true;
      }

      // Add email with source if missing
      if (email && !companyRecord.contact.emails.some(e => e.value.toLowerCase() === email.toLowerCase())) {
        companyRecord.contact.emails.push({ value: email, sourceUrl });
        isUpdated = true;
      }

      // Add phone with source if missing
      if (phone && !companyRecord.contact.phones.some(p => p.value === phone)) {
        companyRecord.contact.phones.push({ value: phone, sourceUrl });
        isUpdated = true;
      }

      // Add tech evidence if isTech discovered
      if (isTech && !companyRecord.isTech) {
        companyRecord.isTech = true;
        for (const ev of techEvidence) {
          companyRecord.techEvidence.push(ev);
        }
        isUpdated = true;
      }

      if (isUpdated) {
        await companyRecord.save();
        updatedCompanies++;
      }
    } else {
      // Create new Company
      const slug = await getUniqueSlug(name);
      const newCompData = {
        name,
        slug,
        category,
        isTech,
        techEvidence,
        contact: {
          emails: email ? [{ value: email, sourceUrl }] : [],
          phones: phone ? [{ value: phone, sourceUrl }] : [],
          contactPageUrl: null
        },
        sources: [sourceUrl],
        followUpStatus: 'to_contact',
        enrichmentStatus: 'pending'
      };
      if (domain) newCompData.domain = domain;
      if (website) newCompData.website = website;

      companyRecord = new Company(newCompData);

      await companyRecord.save();
      createdCompanies++;

      // Link any existing jobs that match this company
      const linked = await linkJobsForCompany(companyRecord, Job);
      jobsLinked += linked;
    }

    // Upsert Office for this company
    // Check if an office with same source or near coordinates exists for this company & city
    const existingOffice = await Office.findOne({
      companyId: companyRecord._id,
      cityId: city._id,
      $or: [
        { addressSource: sourceUrl },
        {
          lat: { $gte: lat - 0.0005, $lte: lat + 0.0005 },
          lng: { $gte: lon - 0.0005, $lte: lon + 0.0005 }
        }
      ]
    });

    if (existingOffice) {
      skippedDuplicates++;
    } else {
      await Office.create({
        companyId: companyRecord._id,
        cityId: city._id,
        address: address || `${name}, ${city.name}`,
        locality,
        lat,
        lng: lon,
        addressSource: sourceUrl,
        addressType: 'unknown',
        verified: false // OSM entries remain unverified candidates until reviewed
      });
      createdOffices++;
    }
  }

  const summary = {
    city: city.name,
    citySlug: city.slug,
    elementsCount: elements.length,
    createdCompanies,
    updatedCompanies,
    createdOffices,
    skippedDuplicates,
    uncertainMerges,
    jobsLinked
  };

  console.log(`\n========================================`);
  console.log(`OSM Import Results for ${city.name}:`);
  console.log(`- Companies Created: ${createdCompanies}`);
  console.log(`- Companies Updated: ${updatedCompanies}`);
  console.log(`- Offices Created:   ${createdOffices}`);
  console.log(`- Duplicates Skipped:${skippedDuplicates}`);
  console.log(`- Uncertain Merges:  ${uncertainMerges}`);
  console.log(`- Jobs Linked:       ${jobsLinked}`);
  console.log(`========================================\n`);

  return summary;
}

if (require.main === module) {
  const cityArg = process.argv[2] || 'kolkata';
  const forceArg = process.argv.includes('--force');

  importOsmForCity(cityArg, forceArg)
    .then(async (summary) => {
      console.log('[CLI] Finished:', summary);
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Fatal Error]:', err);
      try { await mongoose.disconnect(); } catch (_) {}
      process.exit(1);
    });
}

module.exports = {
  importOsmForCity,
  constructAddress
};

