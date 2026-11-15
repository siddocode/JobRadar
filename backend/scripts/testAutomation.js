/**
 * Test script for Application Automation Agent deliverables:
 * 1. Form-filling blueprints for Greenhouse, Lever, and Workable
 * 2. Strict Safety Invariant for Anti-Bot Challenges (Turnstile, reCAPTCHA, hCaptcha, etc.)
 * 3. End-to-end dispatching (staging, challenge detection, clean dispatch)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  generateFormBlueprint,
  executeFormBlueprint,
  detectAntiBotChallenge,
  checkRequiresAssistedSubmission,
  ATS_FORM_SELECTORS,
  ANTI_BOT_CHALLENGE_TYPES
} = require('../workers/browserWorker');

const {
  stageApplication,
  dispatchApplication
} = require('../services/browserSubmissionService');

const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');

async function run() {
  console.log('====================================================');
  console.log('APPLICATION AUTOMATION VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // ----------------------------------------------------------------
  // SECTION 1: BLUEPRINT GENERATION FOR GREENHOUSE, LEVER, WORKABLE
  // ----------------------------------------------------------------
  console.log('SECTION 1: Blueprint Generation for Supported ATS Platforms');

  const mockCandidate = {
    name: 'Siddharth Rao',
    email: 'siddharth@example.com',
    phone: '+91 9876543210',
    city: 'Bengaluru',
    country: 'India',
    isIndiaResident: true,
    totalYearsExperience: 5,
    headline: 'Senior Full Stack Engineer (React, Node.js, Go)',
    linkedin: 'https://linkedin.com/in/siddharth-rao',
    github: 'https://github.com/siddharth-rao',
    portfolio: 'https://siddharth-rao.dev'
  };

  // Test 1.1: Greenhouse Blueprint
  const ghBlueprint = generateFormBlueprint(
    'greenhouse',
    'https://boards.greenhouse.io/stripe/jobs/12345',
    mockCandidate
  );
  assert(ghBlueprint.atsType === 'greenhouse', 'Greenhouse ATS recognized');
  assert(ghBlueprint.selectors.firstName.includes('input#first_name'), 'Greenhouse includes firstName selector');
  assert(ghBlueprint.selectors.email.includes('input#email'), 'Greenhouse includes email selector');
  assert(ghBlueprint.selectors.submitBtn.includes('#submit_app'), 'Greenhouse includes submit button selector');
  assert(ghBlueprint.prefilledFields.firstName === 'Siddharth', 'Candidate firstName mapped correctly');
  assert(ghBlueprint.prefilledFields.lastName === 'Rao', 'Candidate lastName mapped correctly');
  assert(ghBlueprint.screeningAnswers.authorizedToWorkInIndia === 'Yes', 'Greenhouse screening answers generated');
  assert(typeof ghBlueprint.clientFillScript === 'string' && ghBlueprint.clientFillScript.includes('JobRadar Autopilot'), 'Greenhouse fill script generated');

  // Test 1.2: Lever Blueprint
  const leverBlueprint = generateFormBlueprint(
    'lever',
    'https://jobs.lever.co/netflix/67890/apply',
    mockCandidate
  );
  assert(leverBlueprint.atsType === 'lever', 'Lever ATS recognized');
  assert(leverBlueprint.selectors.fullName.includes('input[name="name"]'), 'Lever includes fullName selector');
  assert(leverBlueprint.selectors.linkedin.includes('input[name="urls[LinkedIn]"]'), 'Lever includes LinkedIn URL selector');
  assert(leverBlueprint.selectors.github.includes('input[name="urls[GitHub]"]'), 'Lever includes GitHub URL selector');
  assert(leverBlueprint.prefilledFields.fullName === 'Siddharth Rao', 'Lever fullName populated');

  // Test 1.3: Workable Blueprint
  const workableBlueprint = generateFormBlueprint(
    'workable',
    'https://apply.workable.com/delivery-hero/j/ABCDE/apply/',
    mockCandidate
  );
  assert(workableBlueprint.atsType === 'workable', 'Workable ATS recognized');
  assert(workableBlueprint.selectors.firstName.includes('input[name="firstname"]'), 'Workable includes firstname selector');
  assert(workableBlueprint.selectors.submitBtn.includes('button[data-ui="submit-application"]'), 'Workable includes data-ui submitBtn selector');
  assert(workableBlueprint.prefilledFields.email === 'siddharth@example.com', 'Workable candidate email prefilled');

  // ----------------------------------------------------------------
  // SECTION 2: STRICT SAFETY INVARIANT FOR ANTI-BOT CHALLENGES
  // ----------------------------------------------------------------
  console.log('\nSECTION 2: Strict Safety Invariant Verification (Anti-Bot Gates)');

  // Test 2.1: Cloudflare Turnstile Detection
  const turnstileHtml = '<div class="cf-turnstile" data-sitekey="0x4AAAAAA"><iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/v0/api.js"></iframe></div>';
  const turnstileCheck = detectAntiBotChallenge(turnstileHtml);
  assert(turnstileCheck.detected === true, 'Turnstile detected in HTML');
  assert(turnstileCheck.challengeType === ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE, 'Classified as Cloudflare Turnstile');
  assert(turnstileCheck.requiresHumanDispatch === true, 'Requires human dispatch set to true');
  assert(turnstileCheck.safeAction === 'flag_for_human_dispatch', 'Safe action is flag_for_human_dispatch');

  // Test 2.2: Google reCAPTCHA v2 / Enterprise Detection
  const recaptchaHtml = '<div class="g-recaptcha" data-sitekey="xyz"><iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe></div>';
  const recaptchaCheck = detectAntiBotChallenge(recaptchaHtml);
  assert(recaptchaCheck.detected === true, 'Google reCAPTCHA detected in HTML');
  assert(recaptchaCheck.challengeType === ANTI_BOT_CHALLENGE_TYPES.RECAPTCHA_V2, 'Classified as reCAPTCHA v2');
  assert(recaptchaCheck.requiresHumanDispatch === true, 'Requires human verification flag set');

  // Test 2.3: hCaptcha Detection
  const hcaptchaHtml = '<div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div><iframe src="https://newassets.hcaptcha.com/captcha/v1/"></iframe>';
  const hcaptchaCheck = detectAntiBotChallenge(hcaptchaHtml);
  assert(hcaptchaCheck.detected === true, 'hCaptcha detected in HTML');
  assert(hcaptchaCheck.challengeType === ANTI_BOT_CHALLENGE_TYPES.HCAPTCHA, 'Classified as hCaptcha');

  // Test 2.4: Clean Form Execution (No Challenges)
  const cleanResult = executeFormBlueprint(ghBlueprint, {});
  assert(cleanResult.success === true, 'Clean form executed successfully');
  assert(cleanResult.halted === false, 'Execution not halted on clean form');
  assert(cleanResult.requiresHumanVerification === false, 'No human verification required on clean form');
  assert(cleanResult.executionLog.length >= 5, 'Step-by-step execution log recorded');

  // Test 2.5: Execution Halting on Challenge Encountered
  const challengedResult = executeFormBlueprint(ghBlueprint, { html: turnstileHtml });
  assert(challengedResult.success === false, 'Challenged execution marked success=false');
  assert(challengedResult.halted === true, 'Execution strictly halted on challenge');
  assert(challengedResult.requiresHumanVerification === true, 'Requires human verification flagged');
  assert(challengedResult.challengeType === ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE, 'Recorded challenge type matches');
  assert(challengedResult.actionRequired === 'human_verification_dispatch', 'Action required is human_verification_dispatch');

  // ----------------------------------------------------------------
  // SECTION 3: END-TO-END DISPATCHING INTEGRATION
  // ----------------------------------------------------------------
  console.log('\nSECTION 3: End-to-End Staging & Dispatching Integration');

  await mongoose.connect(process.env.MONGODB_URI);

  // Setup test user and job
  const testEmail = `automation_test_${Date.now()}@jobradar.local`;
  const testUser = await User.create({
    email: testEmail,
    password: 'dummyhash123',
    isVerified: true,
    candidateProfile: {
      name: 'Test Candidate',
      city: 'Bengaluru',
      country: 'India',
      isIndiaResident: true,
      totalYearsExperience: 4,
      headline: 'Software Engineer',
      skills: ['JavaScript', 'React', 'Node.js', 'MongoDB']
    }
  });

  const testJob = await Job.create({
    source: 'greenhouse',
    sourceJobId: `test_job_${Date.now()}`,
    title: 'Senior Software Engineer',
    company: 'TestCorp Technologies',
    location: 'Bengaluru, India',
    city: 'Bengaluru',
    applyUrl: 'https://boards.greenhouse.io/testcorp/jobs/999999',
    status: 'open'
  });

  try {
    // Test 3.1: Stage Application via stageApplication service
    const stagedApp = await stageApplication(testUser._id, testJob._id, {
      submissionMode: 'assisted_browser',
      notes: 'Initial test staging'
    });

    assert(Boolean(stagedApp._id), 'Application successfully staged with ID');
    assert(stagedApp.status === 'awaiting_approval', 'Staged application defaults to awaiting_approval');
    assert(stagedApp.submissionMode === 'assisted_browser', 'Submission mode recorded as assisted_browser');
    assert(Boolean(stagedApp.prefilledData), 'Prefilled data populated on staged application');
    assert(stagedApp.prefilledData.fullName === 'Test Candidate', 'Prefilled candidate name matches profile');
    assert(Boolean(stagedApp.tailoredResumeSnapshot || stagedApp.resumeSnapshot), 'Tailored resume snapshot attached');
    assert(stagedApp.events.length >= 1, 'Application lifecycle event logged');

    // Test 3.2: Re-staging is idempotent
    const restagedApp = await stageApplication(testUser._id, testJob._id, {
      submissionMode: 'assisted_browser',
      notes: 'Updated staging note'
    });
    assert(String(restagedApp._id) === String(stagedApp._id), 'Re-staging updates existing application without duplication');
    assert(restagedApp.notes === 'Updated staging note', 'Updated notes persisted');

    // Test 3.3: Dispatch with Anti-Bot Challenge Safety Invariant
    const challengeDispatch = await dispatchApplication(stagedApp._id, testUser._id, {
      simulateChallenge: ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE
    });

    assert(challengeDispatch.halted === true, 'Dispatch strictly halted when challenge encountered');
    assert(challengeDispatch.requiresHumanVerification === true, 'Flagged for human verification');
    assert(challengeDispatch.challengeType === ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE, 'Challenge type recorded');

    // Verify application state in DB: Must NOT be marked applied!
    const appAfterChallenge = await Application.findById(stagedApp._id);
    assert(appAfterChallenge.status === 'awaiting_approval', 'Application status stays awaiting_approval (NOT applied) on challenge');
    assert(appAfterChallenge.submissionResult.halted === true, 'DB submissionResult records halted=true');
    assert(appAfterChallenge.submissionResult.challengeType === ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE, 'DB submissionResult records challenge type');

    // Test 3.4: Clean Dispatch without Challenge
    const cleanDispatch = await dispatchApplication(stagedApp._id, testUser._id, {});
    assert(cleanDispatch.success === true, 'Clean dispatch succeeds');
    assert(cleanDispatch.halted === false, 'Clean dispatch not halted');
    assert(Boolean(cleanDispatch.fillScript), 'Fill script provided for browser automation');

    // Verify application state in DB: Must transition to applied
    const appAfterClean = await Application.findById(stagedApp._id);
    assert(appAfterClean.status === 'applied', 'Application successfully transitioned to status: applied');
    assert(Boolean(appAfterClean.appliedAt), 'appliedAt timestamp populated in database');
    assert(appAfterClean.submissionResult.success === true, 'DB submissionResult records success=true');

    // Test 3.5: Controller endpoints testing
    console.log('\nSECTION 4: Controller Endpoints Verification');
    const applicationController = require('../controllers/applicationController');

    // Test stageApplication controller endpoint
    let stageStatusCode = null;
    let stageJsonData = null;
    const mockStageReq = {
      user: { id: testUser._id },
      body: {
        jobId: testJob._id,
        submissionMode: 'assisted_browser',
        matchScore: 92
      }
    };
    const mockStageRes = {
      status(code) {
        stageStatusCode = code;
        return this;
      },
      json(data) {
        stageJsonData = data;
        return this;
      }
    };

    await applicationController.stageApplication(mockStageReq, mockStageRes);
    assert(stageStatusCode === 200, 'Controller stageApplication returns HTTP 200');
    assert(stageJsonData && stageJsonData.success === true, 'Controller stageApplication returns success=true');
    assert(Boolean(stageJsonData.application), 'Controller stageApplication returns staged application record');
    assert(stageJsonData.application.matchScore === 92, 'Controller matchScore persisted');

    // Test dispatchApplication controller endpoint
    let dispatchStatusCode = null;
    let dispatchJsonData = null;
    const mockDispatchReq = {
      user: { id: testUser._id },
      params: { id: stageJsonData.application._id },
      body: {}
    };
    const mockDispatchRes = {
      status(code) {
        dispatchStatusCode = code;
        return this;
      },
      json(data) {
        dispatchJsonData = data;
        return this;
      }
    };

    await applicationController.dispatchApplication(mockDispatchReq, mockDispatchRes);
    assert(dispatchStatusCode === 200, 'Controller dispatchApplication returns HTTP 200');
    assert(dispatchJsonData && dispatchJsonData.success === true, 'Controller dispatchApplication returns success=true');
    assert(dispatchJsonData.application.status === 'applied', 'Controller dispatch transitions status to applied');

    console.log('\n====================================================');
    console.log(`SUMMARY: ${passed}/${total} AUTOMATION TESTS PASSED`);
    console.log('====================================================\n');
  } finally {
    // Clean up test documents
    await Application.deleteMany({ userId: testUser._id });
    await Job.deleteOne({ _id: testJob._id });
    await User.deleteOne({ _id: testUser._id });
    await mongoose.disconnect();
  }
}

run().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
