const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { resolveCorridor } = require('../utils/corridorResolver');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[Reclassify] Connecting to MongoDB...');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 20000 });
  console.log('[Reclassify] Connected successfully.');

  const total = await Job.countDocuments();
  console.log(`[Reclassify] Total jobs in database: ${total}`);

  const batchSize = 500;
  let processed = 0;
  let updatedCount = 0;
  let bulkOps = [];

  const cursor = Job.find({})
    .select('_id location locationRaw city state country techCorridor locality officeAddress company title workMode')
    .cursor({ batchSize });

  for await (const job of cursor) {
    processed++;

    const loc = resolveCorridor(job.locationRaw || job.location, {
      localityHint: job.locality,
      officeAddress: job.officeAddress,
      companyName: job.company,
      title: job.title
    });

    const newCity = loc.city || job.city || null;
    const newState = loc.state || job.state || null;
    const newCountry = loc.country || null;
    const newCorridor = loc.techCorridor || job.techCorridor || null;
    const newLocality = loc.locality || job.locality || null;
    const newCoordinates = loc.coordinates || null;
    const newWorkMode = (job.workMode && job.workMode !== 'unknown') ? job.workMode : loc.workMode;

    // Check if anything meaningful changed
    const countryChanged = job.country !== newCountry;
    const cityChanged = job.city !== newCity;
    const corridorChanged = job.techCorridor !== newCorridor;

    if (countryChanged || cityChanged || corridorChanged) {
      bulkOps.push({
        updateOne: {
          filter: { _id: job._id },
          update: {
            $set: {
              city: newCity,
              state: newState,
              country: newCountry,
              techCorridor: newCorridor,
              locality: newLocality,
              coordinates: newCoordinates,
              workMode: newWorkMode
            }
          }
        }
      });
    }

    if (bulkOps.length >= batchSize) {
      const res = await Job.bulkWrite(bulkOps, { ordered: false });
      updatedCount += res.modifiedCount;
      bulkOps = [];
      console.log(`[Reclassify] Processed ${processed}/${total} (Updated: ${updatedCount})...`);
    }
  }

  if (bulkOps.length > 0) {
    const res = await Job.bulkWrite(bulkOps, { ordered: false });
    updatedCount += res.modifiedCount;
  }

  console.log(`[Reclassify] Finished! Processed ${processed} jobs, updated ${updatedCount} records.`);

  // Print post-update country breakdown
  const countryBreakdown = await Job.aggregate([
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('[Reclassify] New Country Breakdown:', countryBreakdown);

  // Check top cities under India
  const indiaCities = await Job.aggregate([
    { $match: { country: 'India', city: { $ne: null } } },
    { $group: { _id: '$city', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('[Reclassify] Cities under India (Top 15):', indiaCities.slice(0, 15));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[Reclassify] Fatal error:', err);
  process.exit(1);
});
