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
  console.log('[CityEnrich] Connecting to DB...');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 15000 });
  console.log('[CityEnrich] Connected!');

  const cities = ['Gurugram', 'Hyderabad', 'Pune', 'Noida', 'New Delhi', 'Mumbai', 'Chennai'];
  let totalUpdated = 0;

  for (const city of cities) {
    const jobs = await Job.find({ city });
    console.log(`[CityEnrich] ${city}: checking ${jobs.length} jobs...`);
    let count = 0;

    for (const job of jobs) {
      const isStaleCorridorLocality = job.locality && (
        job.locality.includes('Expressway') ||
        job.locality.includes('Sector 62') ||
        job.locality.includes('Film City') ||
        job.locality.includes('Knowledge Park') ||
        job.locality.includes('Cluster')
      );
      const cleanLocalityHint = isStaleCorridorLocality ? null : job.locality;

      const loc = resolveCorridor(job.locationRaw || job.location, {
        localityHint: cleanLocalityHint,
        officeAddress: job.officeAddress,
        companyName: job.company
      });

      if (loc.techCorridor && (loc.techCorridor !== job.techCorridor || loc.locality !== job.locality)) {
        await Job.updateOne(
          { _id: job._id },
          {
            $set: {
              techCorridor: loc.techCorridor,
              locality: loc.locality,
              coordinates: loc.coordinates
            }
          }
        );
        count++;
      }
    }
    console.log(`[CityEnrich] ${city}: updated ${count} jobs.`);
    totalUpdated += count;
  }

  console.log(`[CityEnrich] Finished! Total updated: ${totalUpdated}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[CityEnrich] Error:', err);
  process.exit(1);
});
