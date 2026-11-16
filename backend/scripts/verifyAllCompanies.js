/**
 * Real-world verification script for all 84 configured company targets in companies.json
 * Tests live endpoints, parses returned jobs, validates field completeness, and identifies inactive/empty targets.
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const companies = require('../config/companies.json');
const { fetchGreenhouseJobs } = require('../adapters/greenhouse');
const { fetchLeverJobs } = require('../adapters/lever');
const { fetchAshbyJobs } = require('../adapters/ashby');
const { fetchSmartRecruitersJobs } = require('../adapters/smartrecruiters');
const { fetchWorkdayJobs } = require('../adapters/workday');
const { fetchAmazonJobs } = require('../adapters/amazon');
const { fetchGoogleJobs } = require('../adapters/google');
const { fetchEightfoldJobs } = require('../adapters/eightfold');
const { fetchWorkableJobs } = require('../adapters/workable');
const { fetchRecruiteeJobs } = require('../adapters/recruitee');
const { fetchPersonioJobs } = require('../adapters/personio');
const { fetchTeamtailorJobs } = require('../adapters/teamtailor');

async function testSingleCompany(company) {
  const ats = (company.ats || '').toLowerCase();
  const slug = company.slug;
  const name = company.name;
  const startTime = Date.now();

  let fetchResult = { success: false, error: 'Uninitialized', jobs: [] };

  try {
    switch (ats) {
      case 'greenhouse':
        fetchResult = await fetchGreenhouseJobs(slug, name);
        break;
      case 'lever':
        fetchResult = await fetchLeverJobs(slug, name);
        break;
      case 'ashby':
        fetchResult = await fetchAshbyJobs(slug, name);
        break;
      case 'smartrecruiters':
        fetchResult = await fetchSmartRecruitersJobs(slug, name);
        break;
      case 'workday':
        fetchResult = await fetchWorkdayJobs(company.workday || company, name);
        break;
      case 'amazon':
        fetchResult = await fetchAmazonJobs(company.query || {}, name);
        break;
      case 'google':
        fetchResult = await fetchGoogleJobs(company.query || 'software', name);
        break;
      case 'eightfold':
        fetchResult = await fetchEightfoldJobs(company.eightfold || company, name);
        break;
      case 'workable':
        fetchResult = await fetchWorkableJobs(slug, name);
        break;
      case 'recruitee':
        fetchResult = await fetchRecruiteeJobs(slug, name);
        break;
      case 'personio':
        fetchResult = await fetchPersonioJobs(slug, name);
        break;
      case 'teamtailor':
        fetchResult = await fetchTeamtailorJobs(slug, name);
        break;
      default:
        fetchResult = { success: false, error: `Unsupported ATS: ${ats}`, jobs: [] };
    }
  } catch (err) {
    fetchResult = { success: false, error: err.message, jobs: [] };
  }

  const durationMs = Date.now() - startTime;
  const jobs = Array.isArray(fetchResult.jobs) ? fetchResult.jobs : [];

  // Check job completeness on returned jobs
  let sampleValid = false;
  let sampleJob = null;
  let indiaOrRemoteJobs = 0;

  if (jobs.length > 0) {
    sampleJob = jobs[0];
    const hasTitle = Boolean(sampleJob.title && typeof sampleJob.title === 'string');
    const hasLocation = Boolean(sampleJob.location || sampleJob.city || sampleJob.workMode);
    const hasUrl = Boolean(sampleJob.applyUrl || sampleJob.url);
    sampleValid = hasTitle && hasLocation && hasUrl;

    const indiaKeywords = ['india', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'gurgaon', 'gurugram', 'noida', 'chennai', 'delhi', 'kolkata'];
    jobs.forEach(j => {
      const locStr = `${j.location || ''} ${j.city || ''} ${j.workMode || ''}`.toLowerCase();
      if (indiaKeywords.some(k => locStr.includes(k)) || j.workMode === 'remote') {
        indiaOrRemoteJobs++;
      }
    });
  }

  let status = 'failed';
  if (fetchResult.success) {
    status = jobs.length > 0 ? 'active' : 'empty';
  }

  return {
    name,
    ats,
    slug: slug || (company.workday && company.workday.tenant) || '',
    status,
    success: fetchResult.success,
    jobCount: jobs.length,
    indiaOrRemoteJobs,
    durationMs,
    sampleValid,
    sampleTitle: sampleJob ? sampleJob.title : null,
    sampleLocation: sampleJob ? (sampleJob.location || sampleJob.city) : null,
    sampleUrl: sampleJob ? (sampleJob.applyUrl || sampleJob.url) : null,
    error: fetchResult.error || null
  };
}

async function verifyAll() {
  console.log(`================================================================================`);
  console.log(`JOBRADAR REAL-WORLD VERIFICATION: 84 CONFIGURED COMPANY TARGETS`);
  console.log(`================================================================================\n`);

  // 1. Check for duplicates in configuration
  const seenSlugs = new Map();
  const duplicates = [];
  companies.forEach((c, idx) => {
    const key = `${c.ats}:${c.slug || (c.workday && c.workday.tenant) || c.name}`;
    if (seenSlugs.has(key)) {
      duplicates.push({ original: seenSlugs.get(key), duplicate: { idx, ...c } });
    } else {
      seenSlugs.set(key, { idx, ...c });
    }
  });

  if (duplicates.length > 0) {
    console.warn(`[Config Warning] Found ${duplicates.length} duplicate company slug entries:`, duplicates);
  } else {
    console.log(`✓ Config Check: Zero duplicate slug entries found across all ${companies.length} targets.`);
  }

  console.log(`Starting live API probes across all ${companies.length} targets...\n`);

  const results = [];
  // Process in small controlled concurrency (concurrency = 4) to respect rate limits
  const concurrency = 4;
  for (let i = 0; i < companies.length; i += concurrency) {
    const batch = companies.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(c => testSingleCompany(c)));
    results.push(...batchResults);
    
    batchResults.forEach(r => {
      const sym = r.status === 'active' ? '✓' : (r.status === 'empty' ? '○' : '✗');
      console.log(`  ${sym} [${r.ats.padEnd(14)}] ${r.name.padEnd(28)} | Status: ${r.status.toUpperCase().padEnd(6)} | Jobs: ${String(r.jobCount).padStart(4)} | IN/Remote: ${String(r.indiaOrRemoteJobs).padStart(4)} | Time: ${r.durationMs}ms ${r.error ? `| Error: ${r.error}` : ''}`);
    });
  }

  // Summary aggregation
  const activeTargets = results.filter(r => r.status === 'active');
  const emptyTargets = results.filter(r => r.status === 'empty');
  const failedTargets = results.filter(r => r.status === 'failed');
  const totalJobsFetched = results.reduce((sum, r) => sum + r.jobCount, 0);
  const totalIndiaOrRemote = results.reduce((sum, r) => sum + r.indiaOrRemoteJobs, 0);

  const byAts = {};
  results.forEach(r => {
    if (!byAts[r.ats]) {
      byAts[r.ats] = { configured: 0, active: 0, empty: 0, failed: 0, jobs: 0, indiaJobs: 0 };
    }
    byAts[r.ats].configured++;
    if (r.status === 'active') byAts[r.ats].active++;
    else if (r.status === 'empty') byAts[r.ats].empty++;
    else byAts[r.ats].failed++;
    byAts[r.ats].jobs += r.jobCount;
    byAts[r.ats].indiaJobs += r.indiaOrRemoteJobs;
  });

  console.log(`\n================================================================================`);
  console.log(`LIVE TARGET VERIFICATION SUMMARY`);
  console.log(`================================================================================`);
  console.log(`Total Configured Targets:    ${results.length}`);
  console.log(`Active Boards (jobs > 0):    ${activeTargets.length} (${((activeTargets.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Empty Boards (jobs = 0):     ${emptyTargets.length} (${((emptyTargets.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Failed Probes (error/4xx):   ${failedTargets.length} (${((failedTargets.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Total Live Jobs Fetched:     ${totalJobsFetched}`);
  console.log(`Total India / Remote Jobs:   ${totalIndiaOrRemote}`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`ATS Breakdown:`);
  console.log(`ATS             Configured  Active  Empty  Failed  Total Jobs  India/Remote Jobs`);
  console.log(`--------------------------------------------------------------------------------`);
  Object.keys(byAts).forEach(ats => {
    const s = byAts[ats];
    console.log(`${ats.padEnd(15)} ${String(s.configured).padStart(10)} ${String(s.active).padStart(7)} ${String(s.empty).padStart(6)} ${String(s.failed).padStart(7)} ${String(s.jobs).padStart(11)} ${String(s.indiaJobs).padStart(18)}`);
  });
  console.log(`================================================================================\n`);

  if (failedTargets.length > 0) {
    console.log(`FAILED TARGETS DETAILS:`);
    failedTargets.forEach(f => {
      console.log(` - ${f.name} (${f.ats}:${f.slug}): ${f.error}`);
    });
  }

  if (emptyTargets.length > 0) {
    console.log(`\nEMPTY TARGETS DETAILS (Live board with 0 current openings):`);
    emptyTargets.forEach(e => {
      console.log(` - ${e.name} (${e.ats}:${e.slug})`);
    });
  }

  // Write full JSON report to scratch directory for documentation inclusion
  const fs = require('fs');
  const reportPath = path.join(__dirname, '..', '..', 'scratch_company_verification.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalConfigured: results.length,
    activeCount: activeTargets.length,
    emptyCount: emptyTargets.length,
    failedCount: failedTargets.length,
    totalJobsFetched,
    totalIndiaOrRemote,
    byAts,
    failedTargets,
    emptyTargets,
    results
  }, null, 2));

  console.log(`\nSaved verification report to: ${reportPath}`);
}

verifyAll().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});

