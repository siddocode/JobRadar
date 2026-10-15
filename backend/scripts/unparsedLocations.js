const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { normalizeLocation } = require('../utils/normalizeLocation');

async function printUnparsedLocations() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[Unparsed Locations] Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  console.log('[Unparsed Locations] Analyzing jobs in database...');
  const jobs = await Job.find({}, 'location locationRaw title company country city workMode').lean();

  const unparsedMap = new Map();
  let totalJobs = jobs.length;
  let parsedCount = 0;
  let unparsedCount = 0;

  for (const job of jobs) {
    const raw = job.locationRaw || job.location || 'Unspecified';
    const loc = normalizeLocation(raw, { title: job.title });

    if (loc.city) {
      parsedCount++;
    } else {
      unparsedCount++;
      const current = unparsedMap.get(raw) || { count: 0, companies: new Set(), country: loc.country, workMode: loc.workMode };
      current.count++;
      current.companies.add(job.company);
      unparsedMap.set(raw, current);
    }
  }

  console.log('\n============================================================');
  console.log(`[Location Normalization Report] Total: ${totalJobs} | Parsed: ${parsedCount} | Unparsed City: ${unparsedCount}`);
  console.log('============================================================\n');

  // Sort by count descending
  const sorted = Array.from(unparsedMap.entries()).sort((a, b) => b[1].count - a[1].count);

  console.log('Unparsed Location Strings (Top 50):');
  console.log('------------------------------------------------------------');
  sorted.slice(0, 50).forEach(([raw, info], idx) => {
    const compStr = Array.from(info.companies).slice(0, 3).join(', ');
    console.log(`${idx + 1}. "${raw}" (${info.count} jobs) [Country: ${info.country || 'unknown'}, Mode: ${info.workMode}] - [Companies: ${compStr}]`);
  });

  console.log('\nTip: To map any of these to a canonical Indian city, add the alias to backend/config/locationAliases.json\n');

  await mongoose.disconnect();
}

if (require.main === module) {
  printUnparsedLocations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Unparsed Locations] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { printUnparsedLocations };
