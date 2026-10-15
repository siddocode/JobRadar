const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Job = require('../models/Job');
const Company = require('../models/Company');
const { slugify, linkJobsForCompany } = require('../utils/companyUtils');

async function syncJobCompanies() {
  console.log('========================================');
  console.log('Linking Existing Jobs to Company Records');
  console.log('========================================');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected to MongoDB');

  const distinctCompanies = await Job.distinct('company');
  console.log(`Found ${distinctCompanies.length} distinct company names in Jobs collection.`);

  let createdCount = 0;
  let linkedTotal = 0;

  for (const name of distinctCompanies) {
    if (!name || !name.trim()) continue;

    const cleanName = name.trim();
    const slug = slugify(cleanName);

    let company = await Company.findOne({
      $or: [
        { slug },
        { name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      ]
    });

    if (!company) {
      // Find sample job to see source
      const sampleJob = await Job.findOne({ company: cleanName });
      company = new Company({
        name: cleanName,
        slug,
        category: 'Tech / Product Company',
        isTech: true,
        techEvidence: [
          {
            what: `Active job postings from ATS source: ${sampleJob?.source || 'greenhouse'}`,
            sourceUrl: sampleJob?.applyUrl || 'https://jobradar.local'
          }
        ],
        atsType: sampleJob?.source || null,
        atsSlug: slug,
        sources: [sampleJob?.applyUrl || 'https://jobradar.local'],
        followUpStatus: 'to_contact',
        enrichmentStatus: 'pending'
      });
      await company.save();
      createdCount++;
    }

    const linked = await linkJobsForCompany(company, Job);
    linkedTotal += linked;
    console.log(`  -> "${cleanName}": ${linked} jobs linked.`);
  }

  console.log(`\n========================================`);
  console.log(`Job Sync Results:`);
  console.log(`- Companies Created: ${createdCount}`);
  console.log(`- Total Jobs Linked: ${linkedTotal}`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
}

syncJobCompanies().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
