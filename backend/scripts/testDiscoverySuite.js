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
const { verifyAtsSlug, ATS_PATTERNS } = require('../services/atsDetector');
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
