const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { resolveCorridor, classifyRole } = require('../utils/corridorResolver');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[Enrich] Connecting to DB...');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 15000 });
  console.log('[Enrich] Connected!');

  const total = await Job.countDocuments();
  console.log(`[Enrich] Total jobs to process: ${total}`);

  const batchSize = 500;
  let processed = 0;
  let updated = 0;

  let cursor = Job.find({}).cursor({ batchSize });

  let bulkOps = [];
  for await (const job of cursor) {
    processed++;

    const locData = resolveCorridor(job.locationRaw || job.location, {
      localityHint: job.locality,
      officeAddress: job.officeAddress,
      companyName: job.company
    });

    const roleData = classifyRole(job.title, job.descriptionHtml || '');

    bulkOps.push({
      updateOne: {
        filter: { _id: job._id },
        update: {
          $set: {
            city: locData.city || job.city,
            state: locData.state || job.state,
            country: locData.country || job.country || 'India',
            techCorridor: locData.techCorridor || null,
            locality: locData.locality || null,
            coordinates: locData.coordinates || null,
            roleFamily: roleData.roleFamily,
            seniority: roleData.seniority,
            fresherFriendly: roleData.fresherFriendly,
            expMin: roleData.expMin,
            expMax: roleData.expMax,
            workMode: (job.workMode && job.workMode !== 'unknown') ? job.workMode : locData.workMode
          }
        }
      }
    });

    if (bulkOps.length >= batchSize) {
      await Job.bulkWrite(bulkOps, { ordered: false });
      updated += bulkOps.length;
      bulkOps = [];
      console.log(`[Enrich] Processed ${processed}/${total} jobs...`);
    }
  }

  if (bulkOps.length > 0) {
    await Job.bulkWrite(bulkOps, { ordered: false });
    updated += bulkOps.length;
  }

  console.log(`[Enrich] Completed! Processed ${processed} jobs, updated ${updated}.`);

  // Quick summary of hubs and corridors
  const corridors = await Job.aggregate([
    { $match: { techCorridor: { $ne: null } } },
    { $group: { _id: { city: '$city', corridor: '$techCorridor' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('\nTop corridors populated:');
  corridors.slice(0, 15).forEach(c => {
    console.log(`- ${c._id.city} (${c._id.corridor}): ${c.count} jobs`);
  });

  const freshers = await Job.countDocuments({ fresherFriendly: true });
  console.log(`\nFresher/Entry-Level friendly jobs: ${freshers}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[Enrich] Error:', err);
  process.exit(1);
});
