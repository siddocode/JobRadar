const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

async function migrate() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[Migrate] Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  console.log('[Migrate] Finding jobs to normalize...');
  const jobs = await Job.find({}).lean();
  console.log(`[Migrate] Found ${jobs.length} jobs to inspect and normalize.`);

  const bulkOps = [];
  let updatedCount = 0;

  for (const job of jobs) {
    const rawLoc = job.locationRaw || job.location || 'Unspecified';
    const locNorm = normalizeLocation(rawLoc, { title: job.title });
    const fingerprint = generateFingerprint(job.company, job.title, locNorm.city);

    bulkOps.push({
      updateOne: {
        filter: { _id: job._id },
        update: {
          $set: {
            locationRaw: locNorm.locationRaw,
            city: locNorm.city,
            state: locNorm.state,
            country: locNorm.country,
            workMode: locNorm.workMode,
            fingerprint
          }
        }
      }
    });

    if (bulkOps.length >= 500) {
      await Job.bulkWrite(bulkOps);
      updatedCount += bulkOps.length;
      bulkOps.length = 0;
      console.log(`[Migrate] Updated ${updatedCount} jobs...`);
    }
  }

  if (bulkOps.length > 0) {
    await Job.bulkWrite(bulkOps);
    updatedCount += bulkOps.length;
  }

  console.log(`[Migrate] Complete! Successfully normalized ${updatedCount} jobs.`);
  await mongoose.disconnect();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Migrate] Error:', err);
    process.exit(1);
  });
