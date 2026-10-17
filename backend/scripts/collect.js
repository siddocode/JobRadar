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
const Job = require('../models/Job');
const SourceRun = require('../models/SourceRun');

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

  // Handle failed fetch: Log SourceRun and return WITHOUT closing any jobs
  if (!fetchResult.success) {
    const durationMs = Date.now() - startTime;
    console.warn(`[Collect] Warning for "${company.name}": ${fetchResult.error}`);

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
        return {
          updateOne: {
            filter: { source: job.source, sourceJobId: job.sourceJobId },
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
        };
      });

      if (bulkOps.length > 0) {
        await Job.bulkWrite(bulkOps, { ordered: false });
      }
    }

    // Mark jobs that were previously open for this company but missing from latest feed as closed
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

    const jobsClosed = closeResult.modifiedCount || 0;
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

      const bulkOps = uniqueJobs.map((job) => ({
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

  return {
    results,
    totalFetched,
    totalUpserted,
    totalClosed,
    totalErrors,
    durationSeconds: overallDuration
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
  connectDB
};
