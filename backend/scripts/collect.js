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
const { fetchAdzunaJobs } = require('../adapters/adzuna');
const Job = require('../models/Job');
const SourceRun = require('../models/SourceRun');

/**
 * Connect to MongoDB with timeout settings.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`[Collect] Connecting to database: ${maskedUri}`);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });
  console.log('[Collect] MongoDB connected successfully.');
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

  if (jobs.length > 0) {
    const bulkOps = jobs.map((job) => {
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

    await Job.bulkWrite(bulkOps, { ordered: false });
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

  if (jobs.length > 0) {
    const bulkOps = jobs.map((job) => ({
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

    await Job.bulkWrite(bulkOps, { ordered: false });
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
  collectForCompany
};
