const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Company = require('../models/Company');
const Job = require('../models/Job');
const { enrichCompanyWebsite } = require('../utils/enrichWebsite');
const { linkJobsForCompany } = require('../utils/companyUtils');

async function runEnrichment() {
  const args = process.argv.slice(2);
  let limit = 10;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || 10;
  }
  const allFlag = args.includes('--all');
  const slugArg = args.find(a => !a.startsWith('--'));

  console.log('========================================');
  console.log('Polite Website Enrichment Runner');
  console.log('========================================');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected to MongoDB');

  const query = {
    website: { $ne: null, $nin: ['', null] }
  };

  if (slugArg) {
    query.slug = slugArg;
  } else if (!allFlag) {
    query.enrichmentStatus = { $in: ['pending', null] };
  }

  let companies = await Company.find(query).limit(allFlag ? 0 : limit);

  if (companies.length === 0) {
    console.log('[Info] No pending companies found with a website. Checking all companies with websites...');
    companies = await Company.find({ website: { $ne: null, $nin: ['', null] } }).limit(limit);
  }

  console.log(`[Info] Selected ${companies.length} companies to enrich.\n`);

  let enrichedCount = 0;
  let manualCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < companies.length; i++) {
    const comp = companies[i];
    console.log(`----------------------------------------`);
    console.log(`[${i + 1}/${companies.length}] Enriching: "${comp.name}" (${comp.website})`);

    const result = await enrichCompanyWebsite(comp);

    if (result.manual) {
      console.log(`  -> Marked MANUAL (blocked / JS required / robots.txt)`);
      comp.enrichmentStatus = 'manual';
      await comp.save();
      manualCount++;
      continue;
    }

    if (result.skipped || result.error) {
      console.log(`  -> Skipped / Failed: ${result.reason}`);
      skippedCount++;
      continue;
    }

    if (result.success && result.data) {
      const data = result.data;
      let changes = 0;

      if (data.careersUrl && comp.careersUrl !== data.careersUrl) {
        console.log(`  [Careers URL]: ${data.careersUrl}`);
        comp.careersUrl = data.careersUrl;
        changes++;
      }

      if (data.atsType && comp.atsType !== data.atsType) {
        console.log(`  [ATS]: ${data.atsType} (slug: ${data.atsSlug})`);
        comp.atsType = data.atsType;
        comp.atsSlug = data.atsSlug;
        changes++;
      }

      for (const em of data.emails) {
        if (!comp.contact.emails.some(e => e.value.toLowerCase() === em.value.toLowerCase())) {
          console.log(`  [Email]: ${em.value} (source: ${em.sourceUrl})`);
          comp.contact.emails.push(em);
          changes++;
        }
      }

      for (const ph of data.phones) {
        if (!comp.contact.phones.some(p => p.value === ph.value)) {
          console.log(`  [Phone]: ${ph.value} (source: ${ph.sourceUrl})`);
          comp.contact.phones.push(ph);
          changes++;
        }
      }

      for (const te of data.techEvidence) {
        if (!comp.techEvidence.some(t => t.what === te.what)) {
          console.log(`  [Tech Evidence]: ${te.what} (source: ${te.sourceUrl})`);
          comp.techEvidence.push(te);
          comp.isTech = true;
          changes++;
        }
      }

      comp.enrichmentStatus = 'enriched';
      comp.lastVerifiedAt = new Date();
      await comp.save();
      enrichedCount++;

      // Link any existing jobs that match ATS slug or company name
      const linked = await linkJobsForCompany(comp, Job);
      if (linked > 0) {
        console.log(`  [Jobs Linked]: ${linked} jobs matched!`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Enrichment Summary:`);
  console.log(`- Enriched: ${enrichedCount}`);
  console.log(`- Marked Manual: ${manualCount}`);
  console.log(`- Skipped / Failed: ${skippedCount}`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
}

runEnrichment().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
