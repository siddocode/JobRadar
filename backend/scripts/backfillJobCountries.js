const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { normalizeLocation } = require('../utils/normalizeLocation');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';

async function backfill() {
  console.log('[Backfill] Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('[Backfill] Connected.');

  const totalJobs = await Job.countDocuments();
  console.log(`[Backfill] Total jobs in DB: ${totalJobs}`);

  const missingCountryJobs = await Job.find({
    $or: [{ country: null }, { country: '' }, { country: { $exists: false } }]
  }).select('_id locationRaw location applyUrl title country city workMode state');

  console.log(`[Backfill] Jobs with unpopulated country: ${missingCountryJobs.length}`);

  let updatedCount = 0;
  const bulkOps = [];

  for (const job of missingCountryJobs) {
    const rawLoc = job.locationRaw || job.location || '';
    const norm = normalizeLocation(rawLoc, {
      applyUrl: job.applyUrl,
      title: job.title
    });

    const updateFields = {};
    if (norm.country) {
      updateFields.country = norm.country;
    }
    if (!job.city && norm.city) {
      updateFields.city = norm.city;
    }
    if ((!job.workMode || job.workMode === 'unknown') && norm.workMode && norm.workMode !== 'unknown') {
      updateFields.workMode = norm.workMode;
    }

    if (Object.keys(updateFields).length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: job._id },
          update: { $set: updateFields }
        }
      });
      updatedCount++;
    }

    if (bulkOps.length >= 500) {
      await Job.bulkWrite(bulkOps);
      bulkOps.length = 0;
      process.stdout.write(`[Backfill] Processed ${updatedCount} updates...\r`);
    }
  }

  if (bulkOps.length > 0) {
    await Job.bulkWrite(bulkOps);
  }

  console.log(`\n[Backfill] Completed! Total jobs updated with country/city metadata: ${updatedCount}`);

  const CODE_TO_NAME = {
    'GBR': 'United Kingdom', 'UK': 'United Kingdom',
    'DEU': 'Germany', 'DE': 'Germany',
    'BRA': 'Brazil', 'BR': 'Brazil',
    'ITA': 'Italy', 'IT': 'Italy',
    'JPN': 'Japan', 'JP': 'Japan',
    'ISR': 'Israel', 'IL': 'Israel',
    'AUS': 'Australia', 'AU': 'Australia',
    'SG': 'Singapore', 'SGP': 'Singapore',
    'POL': 'Poland', 'PL': 'Poland',
    'FRA': 'France', 'FR': 'France',
    'PHL': 'Philippines', 'PH': 'Philippines',
    'MX': 'Mexico', 'MEX': 'Mexico',
    'TWN': 'Taiwan', 'TW': 'Taiwan',
    'CA': 'Canada', 'CAN': 'Canada',
    'IRL': 'Ireland', 'IE': 'Ireland',
    'ESP': 'Spain', 'ES': 'Spain',
    'TUR': 'Turkey', 'TR': 'Turkey',
    'NLD': 'Netherlands', 'NL': 'Netherlands',
    'CHE': 'Switzerland', 'CH': 'Switzerland',
    'ROU': 'Romania', 'RO': 'Romania'
  };

  for (const [code, name] of Object.entries(CODE_TO_NAME)) {
    await Job.updateMany({ country: code }, { $set: { country: name } });
  }

  // Print country breakdown
  const countryBreakdown = await Job.aggregate([
    { $match: { country: { $ne: null } } },
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('[Backfill] Final Country Breakdown:', JSON.stringify(countryBreakdown, null, 2));

  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('[Backfill] Error:', err);
  process.exit(1);
});
