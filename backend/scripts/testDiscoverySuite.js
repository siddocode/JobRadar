/**
 * Comprehensive Test Suite for Job Discovery Engine
 * Tests ATS Adapters (Personio, Teamtailor, Workable, Recruitee),
 * ATS Detector, Company Model Schema Invariants, Reliability Metrics,
 * and Authoritative Expired-Job Detection Logic.
 */

const assert = require('assert');
const { fetchPersonioJobs, parsePersonioXml, normalizePersonioJob } = require('../adapters/personio');
const { fetchTeamtailorJobs, normalizeTeamtailorJob, extractTeamtailorLocation } = require('../adapters/teamtailor');
const { fetchWorkableJobs, normalizeWorkableJob } = require('../adapters/workable');
const { fetchRecruiteeJobs, normalizeRecruiteeJob } = require('../adapters/recruitee');
const { fetchGreenhouseJobs } = require('../adapters/greenhouse');
const { fetchLeverJobs } = require('../adapters/lever');
const { fetchAshbyJobs } = require('../adapters/ashby');
const { verifyAtsSlug, ATS_PATTERNS } = require('../services/atsDetector');
const { computeSourceLevelStatistics, printSourceLevelStatistics } = require('./collect');
const { resolveCorridor, classifyRole } = require('../utils/corridorResolver');
const companies = require('../config/companies.json');
const Company = require('../models/Company');

async function runTests() {
  console.log('============================================================');
  console.log('[Test Suite] Running Job Discovery & ATS Verification Tests');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${name}:`, e.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${name}:`, e.message);
      failed++;
    }
  }

  // 1. Company Model Schema Tests
  console.log('[1] Company Model & Schema Metrics:');
  test('Company schema contains reliabilityScore with default 100', () => {
    const paths = Company.schema.paths;
    assert(paths.reliabilityScore, 'Missing reliabilityScore path');
    assert.strictEqual(paths.reliabilityScore.defaultValue, 100);
  });

  test('Company schema contains consecutiveFailures with default 0', () => {
    const paths = Company.schema.paths;
    assert(paths.consecutiveFailures, 'Missing consecutiveFailures path');
    assert.strictEqual(paths.consecutiveFailures.defaultValue, 0);
  });

  test('Company schema contains lastSuccessfulSync path', () => {
    const paths = Company.schema.paths;
    assert(paths.lastSuccessfulSync, 'Missing lastSuccessfulSync path');
  });

  test('Company schema atsType enum contains personio, teamtailor, workable, recruitee', () => {
    const atsEnum = Company.schema.paths.atsType.enumValues;
    assert(atsEnum.includes('personio'), 'atsType missing personio');
    assert(atsEnum.includes('teamtailor'), 'atsType missing teamtailor');
    assert(atsEnum.includes('workable'), 'atsType missing workable');
    assert(atsEnum.includes('recruitee'), 'atsType missing recruitee');
  });

  // 2. Personio Adapter Unit Tests
  console.log('\n[2] Personio Adapter Unit & Live Tests:');
  test('parsePersonioXml parses valid position XML blocks', () => {
    const sampleXml = `
      <workzag-jobs>
        <position>
          <id>101</id>
          <name><![CDATA[Lead Software Engineer]]></name>
          <office>Bengaluru</office>
          <additionalOffices>
            <office>Gurugram</office>
          </additionalOffices>
          <department>Engineering</department>
          <jobDescriptions>
            <jobDescription>
              <name>Summary</name>
              <value><![CDATA[<p>Build scalable backend systems</p>]]></value>
            </jobDescription>
          </jobDescriptions>
          <createdAt>2026-11-10T10:00:00Z</createdAt>
        </position>
      </workzag-jobs>
    `;
    const positions = parsePersonioXml(sampleXml);
    assert.strictEqual(positions.length, 1);
    assert.strictEqual(positions[0].id, '101');
    assert.strictEqual(positions[0].name, 'Lead Software Engineer');
    assert.strictEqual(positions[0].office, 'Bengaluru; Gurugram');
    assert(positions[0].descriptionHtml.includes('Build scalable backend systems'));
  });

  test('normalizePersonioJob produces valid JobRadar schema', () => {
    const raw = {
      id: '202',
      name: 'Frontend Developer',
      office: 'Bengaluru, India',
      descriptionHtml: '<p>React engineer</p>',
      createdAt: new Date('2026-11-01')
    };
    const norm = normalizePersonioJob(raw, 'TestCo', 'testco');
    assert.strictEqual(norm.source, 'personio');
    assert.strictEqual(norm.sourceJobId, '202');
    assert.strictEqual(norm.company, 'TestCo');
    assert.strictEqual(norm.title, 'Frontend Developer');
    assert.strictEqual(norm.city, 'Bengaluru');
    assert.strictEqual(norm.country, 'India');
    assert.strictEqual(norm.applyUrl, 'https://testco.jobs.personio.de/job/202');
    assert(norm.fingerprint.includes('testco'));
  });

  await testAsync('fetchPersonioJobs fetches live positions for verified Personio board', async () => {
    const res = await fetchPersonioJobs('personio', 'Personio');
    assert.strictEqual(res.success, true);
    assert(Array.isArray(res.jobs));
    assert(res.jobs.length > 0);
  });

  // 3. Teamtailor Adapter Unit Tests
  console.log('\n[3] Teamtailor Adapter Unit & Live Tests:');
  test('extractTeamtailorLocation parses location objects and remote keywords', () => {
    const rawItem = {
      title: 'Fullstack Engineer',
      _jobposting: {
        jobLocation: [
          { address: { addressLocality: 'Stockholm', addressCountry: 'SE' } }
        ]
      }
    };
    const loc = extractTeamtailorLocation(rawItem);
    assert.strictEqual(loc.rawLoc, 'Stockholm, SE');
    assert.strictEqual(loc.isRemote, false);

    const remoteItem = {
      title: 'Remote DevOps Engineer',
      _jobposting: { jobLocationType: 'TELECOMMUTE' }
    };
    const remoteLoc = extractTeamtailorLocation(remoteItem);
    assert.strictEqual(remoteLoc.isRemote, true);
  });

  test('normalizeTeamtailorJob maps schema.org job fields properly', () => {
    const rawJob = {
      id: 'tt-999',
      title: 'Platform Engineer',
      url: 'https://volumental.teamtailor.com/jobs/999-platform-engineer',
      date_published: '2026-11-05',
      content_html: '<p>Kubernetes expert</p>',
      _jobposting: {
        jobLocation: { address: { addressLocality: 'Bengaluru', addressCountry: 'India' } }
      }
    };
    const norm = normalizeTeamtailorJob(rawJob, 'Volumental', 'volumental');
    assert.strictEqual(norm.source, 'teamtailor');
    assert.strictEqual(norm.sourceJobId, 'tt-999');
    assert.strictEqual(norm.city, 'Bengaluru');
    assert.strictEqual(norm.country, 'India');
    assert.strictEqual(norm.applyUrl, rawJob.url);
  });

  await testAsync('fetchTeamtailorJobs fetches live positions for verified Teamtailor board', async () => {
    const res = await fetchTeamtailorJobs('volumental', 'Volumental');
    assert.strictEqual(res.success, true);
    assert(Array.isArray(res.jobs));
    assert(res.jobs.length > 0);
  });

  // 4. Workable & Recruitee Utilization Tests
  console.log('\n[4] Workable & Recruitee Live Tests:');
  await testAsync('fetchWorkableJobs paginates and fetches verified jobs for Mercari India', async () => {
    const res = await fetchWorkableJobs('mercari-india', 'Mercari India');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length >= 10);
    assert.strictEqual(res.jobs[0].source, 'workable');
  });

  await testAsync('fetchRecruiteeJobs fetches verified offers for Bunq', async () => {
    const res = await fetchRecruiteeJobs('bunq', 'Bunq');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
    assert.strictEqual(res.jobs[0].source, 'recruitee');
  });

  // 5. ATS Detector Tests
  console.log('\n[5] ATS Detector Capabilities:');
  test('ATS_PATTERNS includes personio and teamtailor entries', () => {
    const atsList = ATS_PATTERNS.map(p => p.ats);
    assert(atsList.includes('personio'), 'ATS_PATTERNS missing personio');
    assert(atsList.includes('teamtailor'), 'ATS_PATTERNS missing teamtailor');
    assert(atsList.includes('workable'), 'ATS_PATTERNS missing workable');
    assert(atsList.includes('recruitee'), 'ATS_PATTERNS missing recruitee');
  });

  await testAsync('verifyAtsSlug detects Personio live board', async () => {
    const ok = await verifyAtsSlug('personio', 'personio');
    assert.strictEqual(ok, true);
  });

  await testAsync('verifyAtsSlug detects Teamtailor live board', async () => {
    const ok = await verifyAtsSlug('teamtailor', 'volumental');
    assert.strictEqual(ok, true);
  });

  await testAsync('verifyAtsSlug detects Workable live board', async () => {
    const ok = await verifyAtsSlug('workable', 'mercari-india');
    assert.strictEqual(ok, true);
  });

  await testAsync('verifyAtsSlug detects Recruitee live board', async () => {
    const ok = await verifyAtsSlug('recruitee', 'bunq');
    assert.strictEqual(ok, true);
  });

  // 6. Expanded Target Coverage & Verification
  console.log('\n[6] Expanded Company Targets Coverage:');
  test('companies.json contains expanded targets across Greenhouse, Lever, Ashby, Workable, Recruitee, Personio, and Teamtailor', () => {
    const atsCounts = {};
    for (const c of companies) {
      atsCounts[c.ats] = (atsCounts[c.ats] || 0) + 1;
    }
    assert(atsCounts.greenhouse >= 35, `Expected >= 35 greenhouse, got ${atsCounts.greenhouse}`);
    assert(atsCounts.lever >= 11, `Expected >= 11 lever, got ${atsCounts.lever}`);
    assert(atsCounts.ashby >= 11, `Expected >= 11 ashby, got ${atsCounts.ashby}`);
    assert(atsCounts.workable >= 4, `Expected >= 4 workable, got ${atsCounts.workable}`);
    assert(atsCounts.recruitee >= 4, `Expected >= 4 recruitee, got ${atsCounts.recruitee}`);
    assert(atsCounts.personio >= 3, `Expected >= 3 personio, got ${atsCounts.personio}`);
    assert(atsCounts.teamtailor >= 4, `Expected >= 4 teamtailor, got ${atsCounts.teamtailor}`);
  });

  await testAsync('fetchWorkableJobs fetches authentic jobs for Apna', async () => {
    const res = await fetchWorkableJobs('apna', 'Apna');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  await testAsync('fetchTeamtailorJobs fetches authentic jobs for Mindler', async () => {
    const res = await fetchTeamtailorJobs('mindler', 'Mindler');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  await testAsync('fetchPersonioJobs fetches authentic jobs for Wandelbots', async () => {
    const res = await fetchPersonioJobs('wandelbots', 'Wandelbots');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  await testAsync('fetchRecruiteeJobs fetches authentic jobs for Adjust', async () => {
    const res = await fetchRecruiteeJobs('adjust', 'Adjust');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  await testAsync('fetchAshbyJobs fetches authentic jobs for Harvey', async () => {
    const res = await fetchAshbyJobs('harvey', 'Harvey');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  await testAsync('fetchLeverJobs fetches authentic jobs for Netomi', async () => {
    const res = await fetchLeverJobs('netomi', 'Netomi');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  await testAsync('fetchGreenhouseJobs fetches authentic jobs for Druva', async () => {
    const res = await fetchGreenhouseJobs('druva', 'Druva');
    assert.strictEqual(res.success, true);
    assert(res.jobs.length > 0);
  });

  // 7. Source-Level Statistics Computation
  console.log('\n[7] Source-Level Statistics Computation:');
  await testAsync('computeSourceLevelStatistics computes full source distributions without throwing', async () => {
    const mockRuns = [
      { company: 'Apna', ats: 'workable', status: 'success', fetched: 30, upserted: 30, closed: 0 },
      { company: 'Mindler', ats: 'teamtailor', status: 'success', fetched: 8, upserted: 8, closed: 0 },
      { company: 'Wandelbots', ats: 'personio', status: 'success', fetched: 11, upserted: 11, closed: 0 },
      { company: 'Adjust', ats: 'recruitee', status: 'success', fetched: 30, upserted: 30, closed: 0 },
      { company: 'Harvey', ats: 'ashby', status: 'success', fetched: 50, upserted: 50, closed: 2 },
      { company: 'Netomi', ats: 'lever', status: 'success', fetched: 21, upserted: 21, closed: 0 },
      { company: 'Druva', ats: 'greenhouse', status: 'success', fetched: 27, upserted: 27, closed: 1 },
      { company: 'Test Failed', ats: 'greenhouse', status: 'failed', fetched: 0, upserted: 0, closed: 0, error: 'Rate limit' }
    ];

    const stats = await computeSourceLevelStatistics(mockRuns);
    assert(typeof stats === 'object' && stats !== null);
    assert(stats.workable && stats.workable.companiesConfigured >= 4);
    assert(stats.teamtailor && stats.teamtailor.companiesConfigured >= 4);
    assert(stats.personio && stats.personio.companiesConfigured >= 3);
    assert(stats.recruitee && stats.recruitee.companiesConfigured >= 4);
    assert(stats.ashby && stats.ashby.companiesConfigured >= 11);
    assert(stats.greenhouse && stats.greenhouse.successfulFetches === 1 && stats.greenhouse.failedFetches === 1);
    assert(stats.greenhouse.jobsFetched === 27);
    assert(stats.greenhouse.jobsClosed === 1);
  });

  test('printSourceLevelStatistics executes and displays table cleanly', () => {
    const mockStats = {
      workable: { source: 'workable', companiesConfigured: 4, successfulFetches: 1, failedFetches: 0, jobsFetched: 30, jobsUpserted: 30, jobsClosed: 0, openJobsInDb: 0, lastSyncTime: null, reliability: { high: 1, medium: 0, low: 0, averageScore: 100 } },
      teamtailor: { source: 'teamtailor', companiesConfigured: 4, successfulFetches: 1, failedFetches: 0, jobsFetched: 8, jobsUpserted: 8, jobsClosed: 0, openJobsInDb: 0, lastSyncTime: null, reliability: { high: 1, medium: 0, low: 0, averageScore: 100 } }
    };
    printSourceLevelStatistics(mockStats);
  });

  // 8. Priority Technology Roles & Indian Tech Hub Identification
  console.log('\n[8] Priority Tech Roles & India Hub Normalization:');
  test('resolveCorridor resolves Indian tech hubs and remote modes accurately', () => {
    const hubs = [
      { loc: 'Bengaluru, Karnataka', expCity: 'Bengaluru' },
      { loc: 'Hitec City, Hyderabad', expCity: 'Hyderabad' },
      { loc: 'Hinjewadi, Pune, India', expCity: 'Pune' },
      { loc: 'Bandra Kurla Complex, Mumbai', expCity: 'Mumbai' },
      { loc: 'Cyber City, Gurgaon, India', expCity: 'Gurugram' },
      { loc: 'Sector 62, Noida, Uttar Pradesh', expCity: 'Noida' },
      { loc: 'OMR, Chennai, Tamil Nadu', expCity: 'Chennai' },
      { loc: 'Salt Lake Sector V, Kolkata', expCity: 'Kolkata' },
      { loc: 'India (Remote)', expCountry: 'India' }
    ];

    for (const h of hubs) {
      const res = resolveCorridor(h.loc);
      if (h.expCity) {
        assert.strictEqual(res.city, h.expCity, `Expected ${h.expCity} for ${h.loc}, got ${res.city}`);
      }
      if (h.expCountry) {
        assert.strictEqual(res.country, h.expCountry, `Expected ${h.expCountry} for ${h.loc}, got ${res.country}`);
      }
    }
  });

  test('classifyRole accurately prioritizes tech roles and extracts seniority', () => {
    const testCases = [
      { title: 'Software Engineer - Backend', expSeniority: 'mid', expFresher: false },
      { title: 'Senior Staff Engineer, AI / ML', expSeniority: 'lead_staff', expFresher: false },
      { title: 'Junior Software Engineer', expSeniority: 'entry', expFresher: true },
      { title: 'Graduate Engineer Trainee', expSeniority: 'intern', expFresher: true },
      { title: 'DevOps / SRE Lead', expSeniority: 'lead_staff', expFresher: false },
      { title: 'Full Stack Developer Intern', expSeniority: 'intern', expFresher: true }
    ];

    for (const tc of testCases) {
      const role = classifyRole(tc.title);
      assert.strictEqual(role.seniority, tc.expSeniority, `Seniority mismatch for ${tc.title}`);
      assert.strictEqual(role.fresherFriendly, tc.expFresher, `Fresher mismatch for ${tc.title}`);
    }
  });

  console.log('\n============================================================');
  console.log(`[Test Results] Passed: ${passed} | Failed: ${failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite uncaught failure:', err);
  process.exit(1);
});
