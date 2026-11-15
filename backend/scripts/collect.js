/**
 * Ingestion script to collect real jobs from Greenhouse, Lever, Ashby,
 * SmartRecruiters, and optional Adzuna India.
 *
 * Rules:
 * - Upserts into MongoDB with idempotent compound unique key (source, sourceJobId).
 * - Mark closed ONLY when a successful fetch for that company no longer returns the job.
 * - A failed fetch MUST NOT close jobs.
 * - Handles 404, 429, timeouts, and network errors gracefully without crashing.
 * - Logs a SourceRun record per company run.
 */

const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const companies = require('../config/companies.json');
const { fetchGreenhouseJobs } = require('../adapters/greenhouse');
const { fetchLeverJobs } = require('../adapters/lever');
const { fetchAshbyJobs } = require('../adapters/ashby');
const { fetchSmartRecruitersJobs } = require('../adapters/smartrecruiters');
const { fetchWorkdayJobs } = require('../adapters/workday');
const { fetchAmazonJobs } = require('../adapters/amazon');
const { fetchGoogleJobs } = require('../adapters/google');
const { fetchEightfoldJobs } = require('../adapters/eightfold');
const { fetchUniversalJobs } = require('../adapters/universalFeed');
const { fetchAdzunaJobs } = require('../adapters/adzuna');
const { fetchWorkableJobs } = require('../adapters/workable');
const { fetchRecruiteeJobs } = require('../adapters/recruitee');
const { fetchPersonioJobs } = require('../adapters/personio');
const { fetchTeamtailorJobs } = require('../adapters/teamtailor');
const Job = require('../models/Job');
const Company = require('../models/Company');
const SourceRun = require('../models/SourceRun');
const { resolveCorridor, classifyRole } = require('../utils/corridorResolver');
const { slugify } = require('../utils/companyUtils');
const { generateFingerprint } = require('../utils/normalizeLocation');

// Authoritative direct ATS sources capable of full company board sync and absent job closure
const AUTHORITATIVE_SOURCES = new Set([
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
  'recruitee',
  'personio',
  'teamtailor',
  'workday',
  'eightfold'
]);

/**
 * Connect to MongoDB with timeout settings, retry logic, and CI environment detection.
 */
async function connectDB() {
  const isCI = process.env.CI === 'true' || !!process.env.GITHUB_ACTIONS;
  const rawUri = process.env.MONGODB_URI ? process.env.MONGODB_URI.trim() : '';

  if (!rawUri && isCI) {
    const errorMsg =
      'MONGODB_URI secret is missing in GitHub Actions! Please add MONGODB_URI to your GitHub repository secrets (Settings -> Secrets and variables -> Actions).';
    console.error(`::error::${errorMsg}`);
    throw new Error(errorMsg);
  }

  const uri = rawUri || 'mongodb://127.0.0.1:27017/jobradar';
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`[Collect] Connecting to database: ${maskedUri}`);

  const options = {
    serverSelectionTimeoutMS: isCI ? 25000 : 5000,
    connectTimeoutMS: isCI ? 25000 : 10000,
    family: 4
  };

  let lastErr = null;
  const maxAttempts = isCI ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Collect] Retrying database connection (attempt ${attempt}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      await mongoose.connect(uri, options);
      console.log('[Collect] MongoDB connected successfully.');
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[Collect] DB connection attempt ${attempt} failed: ${err.message}`);
    }
  }

  if (isCI) {
    console.error('\n' + '='.repeat(60));
    console.error('[Collect] DATABASE CONNECTION FAILED IN GITHUB ACTIONS!');
    console.error('Possible Causes:');
    console.error('1. MONGODB_URI secret is missing or invalid in GitHub Secrets.');
    console.error('2. MongoDB Atlas Network Access: GitHub Actions runners have dynamic cloud IPs.');
    console.error('   In MongoDB Atlas -> Network Access, add IP Address "0.0.0.0/0" (Allow access from anywhere).');
    console.error('3. Check username/password credentials in MONGODB_URI.');
    console.error('='.repeat(60) + '\n');
  }
  throw lastErr;
}

/**
 * Collects jobs for a single configured company.
 *
 * @param {Object} company - { name, ats, slug, greenhouseSlug }
 * @returns {Promise<Object>} Run summary metrics
 */
async function collectForCompany(company) {
  const startTime = Date.now();
  const ats = (company.ats || (company.greenhouseSlug ? 'greenhouse' : 'unknown')).toLowerCase();
  const slug = company.slug || company.greenhouseSlug || '';

  console.log(`\n------------------------------------------------------------`);
  console.log(`[Collect] Processing "${company.name}" (ATS: ${ats}, Slug: ${slug})...`);

  let fetchResult = null;

  try {
    switch (ats) {
      case 'greenhouse':
        fetchResult = await fetchGreenhouseJobs(slug, company.name);
        break;
      case 'lever':
        fetchResult = await fetchLeverJobs(slug, company.name);
        break;
      case 'ashby':
        fetchResult = await fetchAshbyJobs(slug, company.name);
        break;
      case 'smartrecruiters':
        fetchResult = await fetchSmartRecruitersJobs(slug, company.name);
        break;
      case 'workday':
        fetchResult = await fetchWorkdayJobs(company.workday || company, company.name);
        break;
      case 'amazon':
        fetchResult = await fetchAmazonJobs(company.query || {}, company.name);
        break;
      case 'google':
        fetchResult = await fetchGoogleJobs(company.query || 'software', company.name);
        break;
      case 'eightfold':
        fetchResult = await fetchEightfoldJobs(company.eightfold || company, company.name);
        break;
      case 'universal':
        fetchResult = await fetchUniversalJobs(company, company.name);
        break;
      case 'workable':
        fetchResult = await fetchWorkableJobs(slug, company.name);
        break;
      case 'recruitee':
        fetchResult = await fetchRecruiteeJobs(slug, company.name);
        break;
      case 'personio':
        fetchResult = await fetchPersonioJobs(slug, company.name);
        break;
      case 'teamtailor':
        fetchResult = await fetchTeamtailorJobs(slug, company.name);
        break;
      default:
        fetchResult = {
          success: false,
          error: `Unsupported ATS type: "${ats}" for company "${company.name}"`,
          jobs: []
        };
    }
  } catch (err) {
    fetchResult = {
      success: false,
      error: `Unexpected error during fetch: ${err.message}`,
      jobs: []
    };
  }

  // Handle failed fetch: Log SourceRun, update company reliability, and return WITHOUT closing any jobs
  if (!fetchResult.success) {
    const durationMs = Date.now() - startTime;
    console.warn(`[Collect] Warning for "${company.name}": ${fetchResult.error}`);

    // Update Company reliability metrics on failure
    try {
      const compSlug = slugify(company.name);
      const existingComp = await Company.findOne({ $or: [{ slug: compSlug }, { name: company.name }] }).lean();
      const newFailures = ((existingComp && existingComp.consecutiveFailures) || 0) + 1;
      const newReliability = Math.max(0, 100 - (newFailures * 15));
      await Company.updateOne(
        { $or: [{ slug: compSlug }, { name: company.name }] },
        {
          $set: {
            consecutiveFailures: newFailures,
            reliabilityScore: newReliability
          }
        }
      );
    } catch (_) {}

    await SourceRun.create({
      source: ats,
      company: company.name,
      slug,
      greenhouseSlug: ats === 'greenhouse' ? slug : '',
      status: 'failed',
      jobsFetched: 0,
      jobsUpserted: 0,
      jobsClosed: 0,
      durationMs,
      errorMessage: fetchResult.error
    });

    return {
      company: company.name,
      ats,
      slug,
      status: 'failed',
      fetched: 0,
      upserted: 0,
      closed: 0,
      error: fetchResult.error
    };
  }

  // Update Company reliability metrics on successful fetch
  try {
    const compSlug = slugify(company.name);
    await Company.updateOne(
      { $or: [{ slug: compSlug }, { name: company.name }] },
      {
        $set: {
          consecutiveFailures: 0,
          reliabilityScore: 100,
          lastSuccessfulSync: now,
          atsType: ats,
          atsSlug: slug || company.slug
        }
      }
    );
  } catch (_) {}

  // Successful fetch: upsert jobs and close absent jobs for this company
  const jobs = fetchResult.jobs || [];
  const now = new Date();
  const activeIds = [];

  try {
    if (jobs.length > 0) {
      // Deduplicate jobs by sourceJobId to prevent MongoBulkWriteError (E11000 duplicate key error)
      const seenIds = new Set();
      const uniqueJobs = [];
      for (const job of jobs) {
        if (job && job.sourceJobId && !seenIds.has(job.sourceJobId)) {
          seenIds.add(job.sourceJobId);
          uniqueJobs.push(job);
        }
      }

      const bulkOps = uniqueJobs.map((job) => {
        activeIds.push(job.sourceJobId);
        const corridorData = resolveCorridor(job.locationRaw || job.location, {
          companyName: job.company
        });
        const roleData = classifyRole(job.title, job.descriptionHtml || '');
        const isFresher = roleData.seniority === 'entry' || (roleData.expMin != null && roleData.expMin <= 1);
        const finalCity = corridorData.city || job.city;
        const finalFingerprint = job.fingerprint || generateFingerprint(job.company, job.title, finalCity);

        return {
          updateOne: {
            filter: { source: job.source, sourceJobId: job.sourceJobId },
            update: {
              $set: {
                company: job.company,
                title: job.title,
                location: job.location,
                locationRaw: job.locationRaw,
                city: finalCity,
                state: corridorData.state || job.state,
                country: corridorData.country || job.country || 'India',
                techCorridor: corridorData.techCorridor || null,
                locality: corridorData.locality || null,
                officeName: corridorData.officeName || null,
                officeAddress: corridorData.officeAddress || null,
                coordinates: corridorData.coordinates || null,
                roleFamily: roleData.roleFamily,
                seniority: roleData.seniority,
                fresherFriendly: isFresher,
                expMin: roleData.expMin,
                expMax: roleData.expMax,
                workMode: (job.workMode && job.workMode !== 'unknown') ? job.workMode : corridorData.workMode,
                fingerprint: finalFingerprint,
                descriptionHtml: job.descriptionHtml,
                applyUrl: job.applyUrl,
                updatedAt: job.updatedAt,
                lastSeenAt: now,
                status: 'open'
              },
              $setOnInsert: {
                firstSeenAt: now
              }
            },
            upsert: true
          }
        };
      });

      if (bulkOps.length > 0) {
        await Job.bulkWrite(bulkOps, { ordered: false });

        // Cross-source deduplication: close or supersede any stale aggregator jobs with identical fingerprint
        if (AUTHORITATIVE_SOURCES.has(ats)) {
          const fps = bulkOps.map(op => op.updateOne.update.$set.fingerprint).filter(Boolean);
          if (fps.length > 0) {
            await Job.updateMany(
              { source: 'adzuna', fingerprint: { $in: fps }, status: 'open' },
              { $set: { status: 'closed' } }
            ).catch(() => {});
          }
        }
      }
    }

    // Mark absent jobs as closed ONLY when the fetch is authoritative
    let jobsClosed = 0;
    if (AUTHORITATIVE_SOURCES.has(ats)) {
      const existingOpenCount = await Job.countDocuments({
        source: ats,
        company: company.name,
        status: 'open'
      });

      // Anomaly guard: if 0 jobs returned but previously > 5 open jobs, skip closure to protect against false positives
      if (jobs.length === 0 && existingOpenCount > 5) {
        console.warn(
          `[Collect] Anomalous 0 jobs returned for "${company.name}" (had ${existingOpenCount} open jobs). ` +
          `Skipping closure to prevent premature expiration.`
        );
      } else if (existingOpenCount > 10 && jobs.length < Math.floor(existingOpenCount * 0.1)) {
        console.warn(
          `[Collect] Suspect sharp job count drop for "${company.name}" (fetched ${jobs.length} vs ${existingOpenCount} open). ` +
          `Skipping closure to prevent premature expiration from partial fetch.`
        );
      } else {
        const closeResult = await Job.updateMany(
          {
            source: ats,
            company: company.name,
            status: 'open',
            sourceJobId: { $nin: activeIds }
          },
          {
            $set: { status: 'closed' }
          }
        );
        jobsClosed = closeResult.modifiedCount || 0;
      }
    } else {
      console.log(`[Collect] Skipping absent job closure for non-authoritative source "${ats}"`);
    }

    const durationMs = Date.now() - startTime;

    console.log(`[Collect] Successfully processed "${company.name}":`);
    console.log(`          Fetched: ${jobs.length} | Upserted: ${jobs.length} | Closed: ${jobsClosed} (${durationMs}ms)`);

    await SourceRun.create({
      source: ats,
      company: company.name,
      slug,
      greenhouseSlug: ats === 'greenhouse' ? slug : '',
      status: 'success',
      jobsFetched: jobs.length,
      jobsUpserted: jobs.length,
      jobsClosed: jobsClosed,
      durationMs,
      errorMessage: null
    });

    return {
      company: company.name,
      ats,
      slug,
      status: 'success',
      fetched: jobs.length,
      upserted: jobs.length,
      closed: jobsClosed,
      error: null
    };
  } catch (dbErr) {
    const durationMs = Date.now() - startTime;
    console.error(`[Collect] Database error for "${company.name}": ${dbErr.message}`);

    try {
      await SourceRun.create({
        source: ats,
        company: company.name,
        slug,
        greenhouseSlug: ats === 'greenhouse' ? slug : '',
        status: 'failed',
        jobsFetched: jobs.length,
        jobsUpserted: 0,
        jobsClosed: 0,
        durationMs,
        errorMessage: dbErr.message
      });
    } catch (_) {}

    return {
      company: company.name,
      ats,
      slug,
      status: 'failed',
      fetched: jobs.length,
      upserted: 0,
      closed: 0,
      error: dbErr.message
    };
  }
}

/**
 * Collects optional jobs from Adzuna if credentials exist.
 */
async function collectAdzuna() {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    return null;
  }

  const startTime = Date.now();
  console.log(`\n------------------------------------------------------------`);
  console.log(`[Collect] Processing Adzuna India job search...`);

  const adzunaResult = await fetchAdzunaJobs();
  if (!adzunaResult.success) {
    console.warn(`[Collect] Adzuna error: ${adzunaResult.error}`);
    return null;
  }

  const jobs = adzunaResult.jobs || [];
  const now = new Date();

  try {
    if (jobs.length > 0) {
      const seenIds = new Set();
      const uniqueJobs = [];
      for (const job of jobs) {
        if (job && job.sourceJobId && !seenIds.has(job.sourceJobId)) {
          seenIds.add(job.sourceJobId);
          uniqueJobs.push(job);
        }
      }

      // Cross-source deduplication: filter out Adzuna aggregator records that duplicate open authoritative ATS jobs
      const authoritativeFPs = new Set(
        (await Job.find({ source: { $in: Array.from(AUTHORITATIVE_SOURCES) }, status: 'open' }, { fingerprint: 1 }).lean())
          .map((j) => j.fingerprint)
          .filter(Boolean)
      );

      const deduplicatedJobs = uniqueJobs.filter((j) => !authoritativeFPs.has(j.fingerprint));

      const bulkOps = deduplicatedJobs.map((job) => ({
        updateOne: {
          filter: { source: 'adzuna', sourceJobId: job.sourceJobId },
          update: {
            $set: {
              company: job.company,
              title: job.title,
              location: job.location,
              locationRaw: job.locationRaw,
              city: job.city,
              state: job.state,
              country: job.country,
              workMode: job.workMode,
              fingerprint: job.fingerprint,
              descriptionHtml: job.descriptionHtml,
              applyUrl: job.applyUrl,
              updatedAt: job.updatedAt,
              lastSeenAt: now,
              status: 'open'
            },
            $setOnInsert: {
              firstSeenAt: now
            }
          },
          upsert: true
        }
      }));

      if (bulkOps.length > 0) {
        await Job.bulkWrite(bulkOps, { ordered: false });
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Collect] Adzuna processed: Fetched: ${jobs.length} | Upserted: ${jobs.length} (${durationMs}ms)`);

    return {
      company: 'Adzuna Aggregator',
      ats: 'adzuna',
      status: 'success',
      fetched: jobs.length,
      upserted: jobs.length,
      closed: 0
    };
  } catch (err) {
    console.error(`[Collect] Adzuna database error: ${err.message}`);
    return {
      company: 'Adzuna Aggregator',
      ats: 'adzuna',
      status: 'failed',
      fetched: jobs.length,
      upserted: 0,
      closed: 0,
      error: err.message
    };
  }
}

/**
 * Computes actual source-level statistics across all configured ATS platforms and ingest sources.
 *
 * @param {Array<Object>} runResults - Individual company results from collection run
 * @returns {Promise<Object>} Map of source stats, open jobs in DB, last sync times, and reliability distributions
 */
async function computeSourceLevelStatistics(runResults = []) {
  const sourceStatsMap = {};

  // 1. Initialize configured companies by source from companies.json
  for (const comp of companies) {
    const s = (comp.ats || 'unknown').toLowerCase();
    if (!sourceStatsMap[s]) {
      sourceStatsMap[s] = {
        source: s,
        companiesConfigured: 0,
        successfulFetches: 0,
        failedFetches: 0,
        jobsFetched: 0,
        jobsUpserted: 0,
        jobsClosed: 0,
        openJobsInDb: 0,
        lastSyncTime: null,
        reliability: { high: 0, medium: 0, low: 0, averageScore: 100 }
      };
    }
    sourceStatsMap[s].companiesConfigured++;
  }

  // 2. Aggregate current run metrics
  for (const r of runResults) {
    const s = (r.ats || 'unknown').toLowerCase();
    if (!sourceStatsMap[s]) {
      sourceStatsMap[s] = {
        source: s,
        companiesConfigured: 0,
        successfulFetches: 0,
        failedFetches: 0,
        jobsFetched: 0,
        jobsUpserted: 0,
        jobsClosed: 0,
        openJobsInDb: 0,
        lastSyncTime: null,
        reliability: { high: 0, medium: 0, low: 0, averageScore: 100 }
      };
    }
    if (r.status === 'success') {
      sourceStatsMap[s].successfulFetches++;
    } else {
      sourceStatsMap[s].failedFetches++;
    }
    sourceStatsMap[s].jobsFetched += (r.fetched || 0);
    sourceStatsMap[s].jobsUpserted += (r.upserted || 0);
    sourceStatsMap[s].jobsClosed += (r.closed || 0);
  }

  // 3. Query actual open jobs count in DB grouped by source (if DB connected)
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const openJobsAgg = await Job.aggregate([
        { $match: { status: 'open' } },
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ]);
      for (const item of openJobsAgg) {
        const s = (item._id || 'unknown').toLowerCase();
        if (!sourceStatsMap[s]) {
          sourceStatsMap[s] = {
            source: s,
            companiesConfigured: 0,
            successfulFetches: 0,
            failedFetches: 0,
            jobsFetched: 0,
            jobsUpserted: 0,
            jobsClosed: 0,
            openJobsInDb: 0,
            lastSyncTime: null,
            reliability: { high: 0, medium: 0, low: 0, averageScore: 100 }
          };
        }
        sourceStatsMap[s].openJobsInDb = item.count;
      }
    } catch (err) {
      console.warn('[Collect] Note: Could not aggregate open jobs by source from DB:', err.message);
    }

    // 4. Query last sync time per source from SourceRun
    try {
      const latestRuns = await SourceRun.aggregate([
        { $match: { status: 'success' } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$source',
            lastSync: { $first: '$createdAt' }
          }
        }
      ]);
      for (const lr of latestRuns) {
        const s = (lr._id || 'unknown').toLowerCase();
        if (sourceStatsMap[s]) {
          sourceStatsMap[s].lastSyncTime = lr.lastSync;
        }
      }
    } catch (err) {
      console.warn('[Collect] Note: Could not aggregate last sync times from SourceRun:', err.message);
    }

    // 5. Query reliability distribution from Company model
    try {
      const companyReliability = await Company.find({}, { atsType: 1, reliabilityScore: 1 }).lean();
      const sourceScores = {};
      for (const comp of companyReliability) {
        const s = (comp.atsType || '').toLowerCase();
        if (!s) continue;
        if (!sourceScores[s]) sourceScores[s] = [];
        const score = typeof comp.reliabilityScore === 'number' ? comp.reliabilityScore : 100;
        sourceScores[s].push(score);
      }

      for (const [s, scores] of Object.entries(sourceScores)) {
        if (sourceStatsMap[s]) {
          const high = scores.filter(score => score >= 80).length;
          const medium = scores.filter(score => score >= 50 && score < 80).length;
          const low = scores.filter(score => score < 50).length;
          const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 100;
          sourceStatsMap[s].reliability = { high, medium, low, averageScore: avg };
        }
      }
    } catch (err) {
      console.warn('[Collect] Note: Could not aggregate company reliability scores:', err.message);
    }
  }

  return sourceStatsMap;
}

/**
 * Prints formatted source-level statistics report to the console.
 *
 * @param {Object} sourceStatsMap
 */
function printSourceLevelStatistics(sourceStatsMap) {
  console.log('\n===================================================================================================================');
  console.log('                                 JOBRADAR SOURCE-LEVEL INGESTION STATISTICS                                        ');
  console.log('===================================================================================================================');
  console.log(
    'Source'.padEnd(16) +
    'Configured'.padStart(12) +
    'Success'.padStart(10) +
    'Failed'.padStart(9) +
    'Fetched'.padStart(10) +
    'Upserted'.padStart(10) +
    'Closed'.padStart(9) +
    'Open in DB'.padStart(12) +
    'Reliability (H/M/L)'.padStart(21) +
    'Avg Rel'.padStart(10)
  );
  console.log('-'.repeat(115));

  const sortedSources = Object.keys(sourceStatsMap).sort();
  for (const src of sortedSources) {
    const st = sourceStatsMap[src];
    const relStr = `${st.reliability.high}/${st.reliability.medium}/${st.reliability.low}`;
    console.log(
      src.padEnd(16) +
      String(st.companiesConfigured).padStart(12) +
      String(st.successfulFetches).padStart(10) +
      String(st.failedFetches).padStart(9) +
      String(st.jobsFetched).padStart(10) +
      String(st.jobsUpserted).padStart(10) +
      String(st.jobsClosed).padStart(9) +
      String(st.openJobsInDb).padStart(12) +
      relStr.padStart(21) +
      `${st.reliability.averageScore}%`.padStart(10)
    );
  }
  console.log('===================================================================================================================\n');
}

/**
 * Main collection orchestrator.
 */
async function runCollection() {
  const overallStart = Date.now();
  console.log('============================================================');
  console.log(`[JobRadar Collection] Starting run for ${companies.length} configured companies...`);
  console.log('============================================================');

  await connectDB();

  const results = [];
  for (const company of companies) {
    const result = await collectForCompany(company);
    results.push(result);
  }

  // Collect from optional Adzuna
  const adzunaRes = await collectAdzuna();
  if (adzunaRes) {
    results.push(adzunaRes);
  }

  const overallDuration = ((Date.now() - overallStart) / 1000).toFixed(2);
  const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
  const totalUpserted = results.reduce((sum, r) => sum + r.upserted, 0);
  const totalClosed = results.reduce((sum, r) => sum + r.closed, 0);
  const totalErrors = results.filter((r) => r.status === 'failed').length;

  console.log('\n============================================================');
  console.log(`[JobRadar Collection Summary] Done in ${overallDuration}s`);
  console.log(`Companies Processed: ${results.length} | Errors: ${totalErrors}`);
  console.log(`Total Fetched: ${totalFetched} | Total Upserted: ${totalUpserted} | Total Closed: ${totalClosed}`);
  console.log('============================================================\n');

  // Compute and display actual source-level statistics
  const sourceStatistics = await computeSourceLevelStatistics(results);
  printSourceLevelStatistics(sourceStatistics);

  return {
    results,
    totalFetched,
    totalUpserted,
    totalClosed,
    totalErrors,
    durationSeconds: overallDuration,
    sourceStatistics
  };
}

// Execute directly if run as a script
if (require.main === module) {
  runCollection()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Collect] Critical fatal failure:', err);
      try {
        await mongoose.disconnect();
      } catch (_) {}
      process.exit(1);
    });
}

module.exports = {
  runCollection,
  collectForCompany,
  connectDB,
  computeSourceLevelStatistics,
  printSourceLevelStatistics
};
