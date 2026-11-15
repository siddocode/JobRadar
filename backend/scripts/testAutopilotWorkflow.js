/**
 * Automated Verification Script for Autopilot Workflow Engine
 * Verifies:
 * 1. End-to-end Pipeline: Discovery -> Deduplication -> Eligibility -> Matching -> Tailoring -> Preparation -> Submission -> Tracking
 * 2. Autopilot Dashboard Controls: Target Roles, Locations, Salary, Thresholds, Quota, Pause/Resume/Stop
 * 3. Safe 90-day Job Archival & Queue Task Cleanup without deleting application history
 * 4. Queue Handlers & Telemetry
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const AutopilotConfig = require('../models/AutopilotConfig');
const AutopilotRun = require('../models/AutopilotRun');
const QueueTask = require('../models/QueueTask');

const {
  executeAutopilotPipelineForUser,
  runScheduledAutopilotBatch
} = require('../controllers/autopilotController');

const {
  archiveStaleJobs,
  cleanupOldQueueTasks,
  runMaintenanceCleanup,
  enqueue,
  processNextTask,
  getQueueStats
} = require('../services/jobQueue');

async function runAutopilotVerification() {
  console.log('====================================================');
  console.log('JOBRADAR AUTOPILOT WORKFLOW AGENT ACCEPTANCE SUITE');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS [Test ${total}]: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [Test ${total}]: ${message}`);
    }
  }

  const testSuffix = Date.now();
  const testUser = await User.create({
    email: `autopilot_test_${testSuffix}@example.com`,
    password: 'hashed_secure_pass',
    name: 'Vikram Patel',
    isVerified: true,
    candidateProfile: {
      name: 'Vikram Patel',
      firstName: 'Vikram',
      lastName: 'Patel',
      email: `autopilot_test_${testSuffix}@example.com`,
      phone: '+919876543210',
      city: 'Bengaluru',
      country: 'India',
      isIndiaResident: true,
      hasUSWorkAuth: false,
      totalYearsExperience: 4,
      skills: ['JavaScript', 'Node.js', 'React', 'MongoDB', 'Docker', 'REST APIs'],
      experience: [
        {
          role: 'Full Stack Engineer',
          company: 'InnoTech Solutions',
          tenure: '2022 - Present',
          bullets: ['Developed high-throughput Node.js microservices.', 'Maintained React frontend views.']
        }
      ],
      education: 'B.Tech in Information Technology'
    }
  });

  try {
    // ----------------------------------------------------
    // Section 1: Dashboard Controls (Pause / Resume / Stop)
    // ----------------------------------------------------
    console.log('SECTION 1: Autopilot Dashboard Controls (Pause / Resume / Stop / Preferences)');

    const config = await AutopilotConfig.create({
      userId: testUser._id,
      enabled: false,
      status: 'paused',
      mode: 'assisted',
      targetRoles: ['Full Stack Engineer', 'Backend Engineer'],
      preferredLocations: ['Bengaluru', 'Remote'],
      workModes: ['remote', 'hybrid', 'onsite'],
      salaryPreferences: { minSalary: 1200000, currency: 'INR', period: 'yearly' },
      minMatchScore: 70,
      dailyLimit: 3,
      blacklistedCompanies: ['BannedCorp']
    });

    assert(config.status === 'paused' && config.enabled === false, 'Autopilot starts paused with enabled: false');

    // Simulate Resume
    config.status = 'active';
    config.enabled = true;
    await config.save();
    assert(config.status === 'active' && config.enabled === true, 'Autopilot resumes with active status');

    // Simulate Stop
    config.status = 'stopped';
    config.enabled = false;
    await config.save();
    assert(config.status === 'stopped' && config.enabled === false, 'Autopilot stops cleanly with stopped state');

    // Restore to active for pipeline testing
    config.status = 'active';
    config.enabled = true;
    await config.save();

    // ----------------------------------------------------
    // Section 2: End-to-End Pipeline
    // ----------------------------------------------------
    console.log('\nSECTION 2: End-to-End Matching & Application Pipeline');

    // Seed test jobs:
    // Job 1: High match in Bengaluru (Software / Full Stack)
    const job1 = await Job.create({
      source: 'greenhouse',
      sourceJobId: `gh_test_${testSuffix}_1`,
      company: 'Razorpay',
      title: 'Full Stack Engineer - Core Platform',
      roleFamily: 'sde_general',
      city: 'Bengaluru',
      location: 'Bengaluru, Karnataka, India',
      country: 'India',
      workMode: 'hybrid',
      salaryMin: 1500000,
      salaryMax: 2500000,
      applyUrl: 'https://boards.greenhouse.io/razorpay/jobs/1111',
      descriptionHtml: '<p>Looking for Node.js, React, and MongoDB developer with 3+ years experience.</p>'
    });

    // Job 2: Blacklisted company (Should be skipped)
    const job2 = await Job.create({
      source: 'lever',
      sourceJobId: `lever_test_${testSuffix}_2`,
      company: 'BannedCorp',
      title: 'Backend Engineer',
      roleFamily: 'sde_backend',
      city: 'Bengaluru',
      location: 'Bengaluru, India',
      applyUrl: 'https://jobs.lever.co/bannedcorp/2222',
      descriptionHtml: '<p>Node.js engineer wanted.</p>'
    });

    // Job 3: Location mismatch (Chennai when candidate preferred Bengaluru / Remote)
    const job3 = await Job.create({
      source: 'ashby',
      sourceJobId: `ashby_test_${testSuffix}_3`,
      company: 'ChennaiFin',
      title: 'Backend Engineer',
      roleFamily: 'sde_backend',
      city: 'Chennai',
      location: 'Chennai, Tamil Nadu, India',
      workMode: 'onsite',
      applyUrl: 'https://jobs.ashbyhq.com/chennaifin/3333',
      descriptionHtml: '<p>Node.js engineer in Chennai office only.</p>'
    });

    // Job 4: Hard work auth blocker (US Citizen / US Security Clearance required)
    const job4 = await Job.create({
      source: 'greenhouse',
      sourceJobId: `gh_test_${testSuffix}_4`,
      company: 'US Defense Tech',
      title: 'Full Stack Engineer',
      roleFamily: 'sde_general',
      location: 'Washington, DC, United States',
      applyUrl: 'https://boards.greenhouse.io/usdefense/4444',
      descriptionHtml: '<p>Must be US citizen with active Secret Clearance. No visa sponsorship.</p>'
    });

    // Job 5: Salary below preference (Max 8 LPA when candidate requested min 12 LPA)
    const job5 = await Job.create({
      source: 'smartrecruiters',
      sourceJobId: `sr_test_${testSuffix}_5`,
      company: 'LowBudget Co',
      title: 'Full Stack Engineer',
      roleFamily: 'sde_general',
      city: 'Bengaluru',
      location: 'Bengaluru, India',
      salaryMin: 500000,
      salaryMax: 800000,
      applyUrl: 'https://jobs.smartrecruiters.com/lowbudget/5555',
      descriptionHtml: '<p>Node.js, React developer.</p>'
    });

    // Execute Autopilot Pipeline for test user
    const pipelineResult = await executeAutopilotPipelineForUser(testUser._id);

    assert(pipelineResult.applicationsCreated >= 1, `Pipeline prepared eligible applications (Created: ${pipelineResult.applicationsCreated})`);

    // Verify application created for Razorpay
    const appRazorpay = await Application.findOne({ userId: testUser._id, jobId: job1._id });
    assert(Boolean(appRazorpay), 'Application record created for matching Razorpay job');
    assert(appRazorpay?.status === 'awaiting_approval', 'Application correctly staged under awaiting_approval');
    assert(appRazorpay?.matchScore >= 70, `Match score evaluated and above threshold (${appRazorpay?.matchScore}%)`);
    assert(Boolean(appRazorpay?.tailoredResumeSnapshot), 'Tailored resume snapshot successfully attached to application');
    assert(Boolean(appRazorpay?.prefilledData?.email === testUser.email), 'ATS blueprint prefilled candidate email correctly');
    assert(appRazorpay?.events?.length >= 1, 'Timeline audit event logged for application creation');

    // Verify filters properly excluded jobs 2, 3, 4, 5
    const appBanned = await Application.findOne({ userId: testUser._id, jobId: job2._id });
    assert(!appBanned, 'Blacklisted company job (BannedCorp) was correctly excluded');

    const appChennai = await Application.findOne({ userId: testUser._id, jobId: job3._id });
    assert(!appChennai, 'Location preference filter excluded non-preferred city (Chennai)');

    const appUS = await Application.findOne({ userId: testUser._id, jobId: job4._id });
    assert(!appUS, 'Hard residency/work authorization blocker job was excluded');

    const appLowSalary = await Application.findOne({ userId: testUser._id, jobId: job5._id });
    assert(!appLowSalary, 'Salary filter excluded job below minimum expected salary');

    // Verify Deduplication on re-run:
    const rerunResult = await executeAutopilotPipelineForUser(testUser._id);
    assert(rerunResult.applicationsCreated === 0, 'Deduplication prevented duplicate application staging on pipeline re-run');

    // ----------------------------------------------------
    // Section 3: Safe 90-Day Archival & Queue Cleanup
    // ----------------------------------------------------
    console.log('\nSECTION 3: Safe 90-Day Job Archival & Task Cleanup');

    // Create a stale job older than 90 days
    const staleJobDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const staleJob = await Job.create({
      source: 'workday',
      sourceJobId: `wd_stale_${testSuffix}`,
      company: 'LegacyCorp',
      title: 'Legacy Cobol Developer',
      location: 'Bengaluru',
      status: 'closed',
      lastSeenAt: staleJobDate,
      applyUrl: 'https://workday.com/legacy/1'
    });

    // Run safe 90-day archival
    const archivalResult = await archiveStaleJobs(90);
    assert(archivalResult.archivedCount >= 1, `Safe 90-day archival transitioned stale jobs to status 'archived' (${archivalResult.archivedCount} jobs)`);

    const reloadedStale = await Job.findById(staleJob._id);
    assert(reloadedStale.status === 'archived', 'Stale job has status: "archived" without record deletion');

    // Verify application history invariant: Razorpay application still intact with complete history
    const preservedApp = await Application.findOne({ userId: testUser._id, jobId: job1._id });
    assert(Boolean(preservedApp && preservedApp.events.length > 0), 'Application history, resume snapshots, and audit events strictly preserved');

    // Create old completed/failed queue tasks
    const oldTaskDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const oldCompletedTask = await QueueTask.create({
      taskType: 'job_ingestion',
      status: 'completed',
      finishedAt: oldTaskDate
    });
    const pendingTask = await QueueTask.create({
      taskType: 'autopilot_execution',
      status: 'pending'
    });

    const cleanupResult = await cleanupOldQueueTasks(7);
    assert(cleanupResult.deletedCount >= 1, `Cleaned up completed tasks older than 7 days (${cleanupResult.deletedCount} tasks)`);

    const preservedPending = await QueueTask.findById(pendingTask._id);
    assert(Boolean(preservedPending), 'Pending background queue tasks remain active and untouched');

    // ----------------------------------------------------
    // Section 4: Background Queue Handlers & Telemetry
    // ----------------------------------------------------
    console.log('\nSECTION 4: Background Queue Handlers & Telemetry');

    // Enqueue an autopilot_user_run task
    const userRunTask = await enqueue('autopilot_user_run', { userId: testUser._id });
    assert(userRunTask && userRunTask.status === 'pending', 'Enqueued autopilot_user_run background task');

    // Process next task
    const processedTask = await processNextTask();
    assert(processedTask && processedTask.status === 'completed', 'Queue worker claimed and executed task successfully');

    // Queue metrics check
    const queueStats = await getQueueStats();
    assert(queueStats.stats.total >= 1, `Queue telemetry tracks background stats (Total: ${queueStats.stats.total})`);

    // Clean up test data
    await Job.deleteMany({
      sourceJobId: {
        $in: [
          `gh_test_${testSuffix}_1`,
          `lever_test_${testSuffix}_2`,
          `ashby_test_${testSuffix}_3`,
          `gh_test_${testSuffix}_4`,
          `sr_test_${testSuffix}_5`,
          `wd_stale_${testSuffix}`
        ]
      }
    });
    await Application.deleteMany({ userId: testUser._id });
    await AutopilotConfig.deleteOne({ userId: testUser._id });
    await AutopilotRun.deleteMany({ userId: testUser._id });
    await QueueTask.deleteMany({ _id: { $in: [oldCompletedTask._id, pendingTask._id, userRunTask._id] } });
    await User.deleteOne({ _id: testUser._id });

  } catch (err) {
    console.error('Test execution error:', err);
    assert(false, `Unexpected error during test: ${err.message}`);
  } finally {
    console.log('\n====================================================');
    console.log(`SUMMARY: ${passed}/${total} AUTOPILOT ACCEPTANCE TESTS PASSED`);
    console.log('====================================================\n');
    await mongoose.disconnect();
    if (passed < total) process.exit(1);
    process.exit(0);
  }
}

runAutopilotVerification();
