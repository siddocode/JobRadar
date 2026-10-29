const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const mongoose = require('mongoose');
const Job = require('../models/Job');
const Company = require('../models/Company');
const portals = require('../config/companyCareerPortals.json');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[FixUrls] Connecting to DB...');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 20000 });
  console.log('[FixUrls] Connected!');

  // Pre-load all companies to map website/careersUrl/atsSlug
  const allCompanies = await Company.find({}).lean();
  const companyByName = new Map();
  for (const c of allCompanies) {
    if (c.name) companyByName.set(c.name.toLowerCase().trim(), c);
  }

  // Pre-load portals lowercase map
  const portalMap = new Map();
  for (const [name, url] of Object.entries(portals)) {
    portalMap.set(name.toLowerCase().trim(), url);
  }

  const query = { applyUrl: { $regex: '^https://www\\.google\\.com/search' } };
  const total = await Job.countDocuments(query);
  console.log(`[FixUrls] Total jobs with Google Search URLs to fix: ${total}`);

  const cursor = Job.find(query).cursor({ batchSize: 500 });
  let processed = 0;
  let updated = 0;
  let bulkOps = [];

  for await (const job of cursor) {
    processed++;
    const compLower = (job.company || '').toLowerCase().trim();

    let resolvedUrl = null;

    // 1. Check verified portals
    if (portalMap.has(compLower)) {
      resolvedUrl = portalMap.get(compLower);
    } else {
      // Fuzzy match in portalMap
      for (const [key, url] of portalMap.entries()) {
        if (compLower.includes(key) || key.includes(compLower)) {
          resolvedUrl = url;
          break;
        }
      }
    }

    // 2. Check linked Company record
    if (!resolvedUrl && companyByName.has(compLower)) {
      const comp = companyByName.get(compLower);
      if (comp.careersUrl) {
        resolvedUrl = comp.careersUrl;
      } else if (comp.atsType && comp.atsSlug) {
        if (comp.atsType === 'greenhouse') resolvedUrl = `https://boards.greenhouse.io/${comp.atsSlug}/`;
        else if (comp.atsType === 'lever') resolvedUrl = `https://jobs.lever.co/${comp.atsSlug}/`;
        else if (comp.atsType === 'smartrecruiters') resolvedUrl = `https://jobs.smartrecruiters.com/${comp.atsSlug}/`;
        else if (comp.atsType === 'ashby') resolvedUrl = `https://jobs.ashbyhq.com/${comp.atsSlug}/`;
      } else if (comp.website) {
        const cleanWeb = comp.website.replace(/\/+$/, '');
        resolvedUrl = `${cleanWeb}/careers`;
      }
    }

    // 3. Fallback to clean company official careers link
    if (!resolvedUrl) {
      const cleanCompName = job.company
        .replace(/\(.*?\)/g, '')
        .replace(/pvt\s+ltd|private\s+limited|technologies|solutions|india|limited|ltd/gi, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (cleanCompName && cleanCompName.length > 2) {
        resolvedUrl = `https://careers.${cleanCompName}.com`;
      }
    }

    if (resolvedUrl) {
      bulkOps.push({
        updateOne: {
          filter: { _id: job._id },
          update: {
            $set: {
              applyUrl: resolvedUrl
            }
          }
        }
      });
    }

    if (bulkOps.length >= 500) {
      const res = await Job.bulkWrite(bulkOps, { ordered: false });
      updated += res.modifiedCount;
      bulkOps = [];
      console.log(`[FixUrls] Processed ${processed}/${total} (Updated: ${updated})...`);
    }
  }

  if (bulkOps.length > 0) {
    const res = await Job.bulkWrite(bulkOps, { ordered: false });
    updated += res.modifiedCount;
  }

  console.log(`[FixUrls] Finished! Processed ${processed}, Updated ${updated} jobs to official career portals.`);

  const remaining = await Job.countDocuments({ applyUrl: { $regex: '^https://www\\.google\\.com/search' } });
  console.log(`[FixUrls] Remaining Google Search URLs in DB: ${remaining}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[FixUrls] Fatal error:', err);
  process.exit(1);
});
