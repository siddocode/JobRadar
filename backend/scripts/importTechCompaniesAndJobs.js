const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const https = require('https');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Company = require('../models/Company');
const { resolveCorridor, classifyRole } = require('../utils/corridorResolver');

const DATA_FILE = path.join(__dirname, '..', 'data', 'extracted_blr_companies.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`Status ${res.statusCode}`));
      }
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function run() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const companiesData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`[Import] Found ${companiesData.length} companies to process.`);

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[Import] Connecting to DB...');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 20000 });
  console.log('[Import] DB Connected!');

  let totalJobsImported = 0;
  let totalCompaniesUpserted = 0;

  // Process in batches with concurrency
  const CONCURRENCY = 6;
  const now = new Date();

  for (let i = 0; i < companiesData.length; i += CONCURRENCY) {
    const chunk = companiesData.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (company) => {
      try {
        // Resolve corridor for company office
        const resolved = resolveCorridor(company.address || company.locality || 'Bengaluru', {
          localityHint: company.locality,
          officeAddress: company.address,
          coordinates: { lat: company.latitude, lng: company.longitude }
        });

        // 1. Upsert Company record
        const compDoc = await Company.findOneAndUpdate(
          { slug: company.slug },
          {
            $set: {
              name: company.name,
              officeName: company.officeName || null,
              locality: company.locality || resolved.locality,
              techCorridor: resolved.techCorridor || null,
              address: company.address || null,
              latitude: company.latitude || null,
              longitude: company.longitude || null,
              logoUrl: company.logoUrl || null,
              jobCount: company.jobCount || 0,
              fresherCount: company.fresherCount || 0,
              isTech: true,
              category: 'Tech / Software'
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        totalCompaniesUpserted++;

        // Only fetch jobs if company has active jobs
        if (!company.jobCount || company.jobCount === 0) return;

        // 2. Fetch jobs from API
        const jobsUrl = `https://www.blrstartuparena.com/api/companies/${encodeURIComponent(company.slug)}/jobs`;
        let jobs = [];
        try {
          jobs = await fetchJson(jobsUrl);
        } catch (fetchErr) {
          // Non-fatal, continue
          return;
        }

        if (!Array.isArray(jobs) || jobs.length === 0) return;

        const jobBulkOps = [];

        for (const item of jobs) {
          if (!item.title) continue;

          // Disambiguate multi-location jobs (e.g. "Bangalore, India; Hyderabad, India")
          const jobLocData = resolveCorridor(item.location || company.locality || 'Bengaluru', {
            localityHint: company.locality,
            officeAddress: company.address,
            coordinates: { lat: company.latitude, lng: company.longitude }
          });

          const roleData = classifyRole(item.title, item.summary || '');

          // Clean apply link (direct company portal search or direct link)
          let applyUrl = item.applyUrl && item.applyUrl.trim();
          if (!applyUrl) {
            // High-precision official apply direct query
            applyUrl = `https://www.google.com/search?q=${encodeURIComponent(`${company.name} ${item.title} careers apply`)}`;
          }

          const sourceJobId = `blr_${company.slug}_${item.id}`;
          const fingerprint = `${company.name}:${item.title}:${jobLocData.city || 'Bengaluru'}`.toLowerCase();

          jobBulkOps.push({
            updateOne: {
              filter: { source: 'company_board', sourceJobId },
              update: {
                $set: {
                  company: company.name,
                  companyId: compDoc._id,
                  title: item.title,
                  location: item.location || company.locality || 'Bengaluru',
                  locationRaw: item.location || company.address || 'Bengaluru',
                  city: jobLocData.city || 'Bengaluru',
                  state: jobLocData.state || 'Karnataka',
                  country: jobLocData.country || 'India',
                  techCorridor: jobLocData.techCorridor || resolved.techCorridor || null,
                  locality: jobLocData.locality || resolved.locality || company.locality,
                  officeName: company.officeName || null,
                  officeAddress: company.address || null,
                  coordinates: jobLocData.coordinates || resolved.coordinates || null,
                  roleFamily: item.roleFamily || roleData.roleFamily,
                  seniority: item.seniority || roleData.seniority,
                  fresherFriendly: item.fresherFriendly === true || roleData.fresherFriendly,
                  expMin: item.expMin ?? roleData.expMin,
                  expMax: item.expMax ?? roleData.expMax,
                  workMode: (item.workMode && item.workMode !== 'unknown') ? item.workMode : jobLocData.workMode,
                  fingerprint,
                  applyUrl,
                  status: 'open',
                  lastSeenAt: now,
                  updatedAt: item.postedAt ? new Date(item.postedAt) : now
                },
                $setOnInsert: {
                  firstSeenAt: item.postedAt ? new Date(item.postedAt) : now
                }
              },
              upsert: true
            }
          });
        }

        if (jobBulkOps.length > 0) {
          await Job.bulkWrite(jobBulkOps, { ordered: false });
          totalJobsImported += jobBulkOps.length;
        }
      } catch (err) {
        console.warn(`[Import] Error on ${company.slug}: ${err.message}`);
      }
    }));

    if ((i + CONCURRENCY) % 30 === 0 || i + CONCURRENCY >= companiesData.length) {
      console.log(`[Import] Progress: ${Math.min(i + CONCURRENCY, companiesData.length)}/${companiesData.length} companies | ${totalJobsImported} jobs upserted...`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[Import] COMPLETE!`);
  console.log(`Total Companies Upserted: ${totalCompaniesUpserted}`);
  console.log(`Total Live Jobs Ingested: ${totalJobsImported}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[Import] Fatal error:', err);
  process.exit(1);
});
