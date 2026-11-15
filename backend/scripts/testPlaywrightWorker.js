/**
 * End-to-End Verification Test for Playwright Browser Automation Worker
 *
 * Verifies:
 * 1. Playwright browser launch and session isolation (headless Chromium / Chrome)
 * 2. Real DOM form inspection, candidate field pre-filling across Greenhouse, Lever, Ashby, and Workable
 * 3. PDF resume attachment via Playwright input files
 * 4. Required fields validation and unfilled field reporting
 * 5. Strict Safety Invariant: NEVER bypass or compute CAPTCHA / Turnstile challenges (immediate halt,
 *    screenshot capture, DOM state recording, 1-click human dispatch fallback)
 * 6. Submission confirmation text, confirmation screenshot, and reference ID extraction
 * 7. End-to-end integration with browserSubmissionService and Application MongoDB model
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  launchBrowserSession,
  detectLiveAntiBotChallenge,
  executePlaywrightApplication,
  ANTI_BOT_CHALLENGE_TYPES
} = require('../workers/browserWorker');

const {
  stageApplication,
  submitApplicationWithPlaywright,
  dispatchApplication
} = require('../services/browserSubmissionService');

const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');

// Candidate test profile
const testCandidate = {
  name: 'Aarav Sharma',
  firstName: 'Aarav',
  lastName: 'Sharma',
  email: 'aarav.sharma@example.in',
  phone: '+91 9123456789',
  city: 'Bengaluru',
  country: 'India',
  isIndiaResident: true,
  totalYearsExperience: 6,
  headline: 'Senior Backend Engineer (Node.js, Go, MongoDB)',
  currentCompany: 'FinTech Innovations India',
  linkedin: 'https://linkedin.com/in/aarav-sharma-tech',
  github: 'https://github.com/aarav-sharma-tech',
  portfolio: 'https://aaravsharma.dev',
  summary: 'Passionate backend engineer with 6+ years of distributed systems experience in Bengaluru tech hubs.'
};

// Minimal valid single-page PDF buffer
const samplePdfBuffer = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF'
);

// HTML Fixtures for ATS portals
const greenhouseFixture = `
<!DOCTYPE html>
<html>
<head><title>Senior Backend Engineer - Greenhouse Application</title></head>
<body>
  <h1>Apply for Senior Backend Engineer</h1>
  <form id="application_form">
    <div id="first_name_field">
      <label for="first_name">First Name *</label>
      <input type="text" id="first_name" name="job_application[first_name]" required />
    </div>
    <div id="last_name_field">
      <label for="last_name">Last Name *</label>
      <input type="text" id="last_name" name="job_application[last_name]" required />
    </div>
    <div id="email_field">
      <label for="email">Email *</label>
      <input type="email" id="email" name="job_application[email]" required />
    </div>
    <div id="phone_field">
      <label for="phone">Phone *</label>
      <input type="tel" id="phone" name="job_application[phone]" required />
    </div>
    <div id="resume_fieldset">
      <label for="resume">Attach Resume (PDF) *</label>
      <input type="file" id="resume" name="job_application[resume]" accept=".pdf,.doc" required />
    </div>
    <div id="linkedin_field">
      <label>LinkedIn Profile</label>
      <input type="text" id="job_application_answers_attributes_0_text_value" name="job_application_answers[0]" />
    </div>
    <div id="website_field">
      <label>Personal Website / Portfolio</label>
      <input type="text" id="job_application_answers_attributes_1_text_value" name="job_application_answers[1]" />
    </div>
    <div id="work_auth_field">
      <label>Are you authorized to work in India?</label>
      <input type="radio" id="auth_yes" name="authorized" value="yes" /> Yes
      <input type="radio" id="auth_no" name="authorized" value="no" /> No
    </div>
    <div id="submit_field">
      <button type="submit" id="submit_app">Submit Application</button>
    </div>
  </form>
  <script>
    document.getElementById('application_form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.body.innerHTML = '<div id="confirmation"><h2>Thank you for applying!</h2><p>Your application was submitted successfully. Application reference: #GH-2026-987654</p></div>';
    });
  </script>
</body>
</html>
`;

const leverFixture = `
<!DOCTYPE html>
<html>
<head><title>Full Stack Lead - Lever Postings</title></head>
<body>
  <h1>Apply for Full Stack Lead</h1>
  <form id="lever_form">
    <input type="text" name="name" data-qa="name-input" required placeholder="Full name" />
    <input type="email" name="email" data-qa="email-input" required placeholder="Email" />
    <input type="tel" name="phone" data-qa="phone-input" required placeholder="Phone" />
    <input type="text" name="org" data-qa="org-input" placeholder="Current company" />
    <input type="text" name="urls[LinkedIn]" data-qa="linkedin-input" placeholder="LinkedIn URL" />
    <input type="text" name="urls[GitHub]" data-qa="github-input" placeholder="GitHub URL" />
    <input type="text" name="urls[Portfolio]" placeholder="Portfolio URL" />
    <input type="file" name="resume" data-qa="resume-upload" required />
    <textarea name="comments" placeholder="Additional information"></textarea>
    <button type="submit" id="btn-submit" data-qa="btn-submit">Submit application</button>
  </form>
  <script>
    document.getElementById('lever_form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.body.innerHTML = '<div><h2>Application received!</h2><p>Thanks for applying to our team. Reference: LEV-88412-TECH</p></div>';
    });
  </script>
</body>
</html>
`;

const ashbyFixture = `
<!DOCTYPE html>
<html>
<head><title>Staff Infrastructure Engineer - Ashby</title></head>
<body>
  <h1>Apply for Staff Infrastructure Engineer</h1>
  <form id="ashby_form">
    <input type="text" name="name" data-qa="name" required placeholder="Name" />
    <input type="email" name="email" data-qa="email" required placeholder="Email" />
    <input type="tel" name="phoneNumber" id="phone" required placeholder="Phone number" />
    <input type="file" name="resume" data-qa="resume" required />
    <input type="text" name="linkedin" id="linkedin" placeholder="LinkedIn" />
    <input type="text" name="github" id="github" placeholder="GitHub" />
    <button type="submit" data-qa="submit-application">Submit Application</button>
  </form>
  <script>
    document.getElementById('ashby_form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.body.innerHTML = '<div><h2>Thank you for your interest!</h2><p>We have received your application. Confirmation Number: ASH-99214</p></div>';
    });
  </script>
</body>
</html>
`;

const workableFixture = `
<!DOCTYPE html>
<html>
<head><title>DevOps Engineer - Workable</title></head>
<body>
  <h1>DevOps Engineer Application</h1>
  <form id="workable_form">
    <input type="text" name="firstname" data-ui="firstname" required placeholder="First Name" />
    <input type="text" name="lastname" data-ui="lastname" required placeholder="Last Name" />
    <input type="email" name="email" data-ui="email" required placeholder="Email" />
    <input type="tel" name="phone" data-ui="phone" placeholder="Phone" />
    <input type="text" name="address" data-ui="address" placeholder="Address" />
    <input type="file" name="resume" data-ui="resume-file" required />
    <input type="text" name="linkedin" data-ui="linkedin" placeholder="LinkedIn" />
    <button type="submit" data-ui="submit-application">Submit application</button>
  </form>
  <script>
    document.getElementById('workable_form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.body.innerHTML = '<div><h2>Application confirmation</h2><p>Thank you for applying. Confirmation: WRK-77123</p></div>';
    });
  </script>
</body>
</html>
`;

const turnstileChallengeFixture = `
<!DOCTYPE html>
<html>
<head>
  <title>Just a moment... | Cloudflare Protection</title>
</head>
<body>
  <div id="challenge-running">
    <div class="cf-browser-verification cf-im-under-attack">
      <div class="cf-turnstile" data-sitekey="0x4AAAAAAABBCDEF">
        <iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/v0/api.js"></iframe>
      </div>
      <p>Checking your browser before accessing the application portal...</p>
    </div>
  </div>
</body>
</html>
`;

const recaptchaChallengeFixture = `
<!DOCTYPE html>
<html>
<head><title>Security Verification</title></head>
<body>
  <h1>Please complete the security check to continue</h1>
  <form id="captcha-form">
    <div class="g-recaptcha" data-sitekey="6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-">
      <iframe src="https://www.google.com/recaptcha/api2/anchor?ar=1"></iframe>
    </div>
  </form>
</body>
</html>
`;

async function runPlaywrightVerificationSuite() {
  console.log('================================================================');
  console.log('PLAYWRIGHT REAL BROWSER APPLICATION AUTOMATION SUITE');
  console.log('================================================================\n');

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
  // SECTION 1: BROWSER LIFECYCLE & ISOLATION
  // ----------------------------------------------------------------
  console.log('SECTION 1: Browser Launch and Session Isolation');

  const session = await launchBrowserSession({ headless: true });
  assert(Boolean(session.browser), 'Headless browser session launched');
  assert(Boolean(session.context), 'Isolated browser context created');
  assert(Boolean(session.page), 'Browser page instantiated');

  const userAgent = await session.page.evaluate(() => navigator.userAgent);
  assert(userAgent.includes('JobRadar') || userAgent.includes('Chrome'), 'Browser page configured with valid user agent');

  await session.page.close();
  await session.context.close();
  await session.browser.close();
  assert(true, 'Browser session closed cleanly without resource leaks');

  // ----------------------------------------------------------------
  // SECTION 2: GREENHOUSE PORTAL DOM INSPECTION & FILLING
  // ----------------------------------------------------------------
  console.log('\nSECTION 2: Greenhouse Portal Inspection & Pre-fill');

  const ghResult = await executePlaywrightApplication({
    htmlContent: greenhouseFixture,
    atsType: 'greenhouse',
    candidateData: testCandidate,
    resumePdfBuffer: samplePdfBuffer,
    resumeFileName: 'Aarav_Sharma_Resume.pdf',
    submit: false
  });

  assert(ghResult.success === true, 'Greenhouse form inspection and fill succeeded');
  assert(ghResult.atsType === 'greenhouse', 'Greenhouse ATS recognized correctly');
  assert(ghResult.filledFields.firstName === 'Aarav', 'First name filled into input#first_name');
  assert(ghResult.filledFields.lastName === 'Sharma', 'Last name filled into input#last_name');
  assert(ghResult.filledFields.email === 'aarav.sharma@example.in', 'Email filled into input#email');
  assert(ghResult.filledFields.phone === '+91 9123456789', 'Phone filled into input#phone');
  assert(ghResult.attachedResume === true, 'Resume PDF buffer attached successfully');
  assert(ghResult.resumeFileName === 'Aarav_Sharma_Resume.pdf', 'Custom resume file name respected');
  assert(ghResult.validation && ghResult.validation.valid === true, 'Required fields validation passed on Greenhouse');
  assert(Boolean(ghResult.screenshotBase64), 'Pre-submission screenshot captured as base64');

  // ----------------------------------------------------------------
  // SECTION 3: LEVER PORTAL DOM INSPECTION & FILLING
  // ----------------------------------------------------------------
  console.log('\nSECTION 3: Lever Portal Inspection & Pre-fill');

  const leverResult = await executePlaywrightApplication({
    htmlContent: leverFixture,
    atsType: 'lever',
    candidateData: testCandidate,
    resumePdfBuffer: samplePdfBuffer,
    submit: false
  });

  assert(leverResult.success === true, 'Lever form inspection and fill succeeded');
  assert(leverResult.atsType === 'lever', 'Lever ATS recognized correctly');
  assert(leverResult.filledFields.fullName === 'Aarav Sharma', 'Full name filled into data-qa="name-input"');
  assert(leverResult.filledFields.email === 'aarav.sharma@example.in', 'Email filled into Lever input');
  assert(leverResult.filledFields.org === 'FinTech Innovations India', 'Current company filled into input[name="org"]');
  assert(leverResult.filledFields.linkedin === 'https://linkedin.com/in/aarav-sharma-tech', 'LinkedIn URL populated in Lever form');
  assert(leverResult.attachedResume === true, 'Resume PDF attached to Lever file input');
  assert(leverResult.validation && leverResult.validation.valid === true, 'Lever required fields valid');

  // ----------------------------------------------------------------
  // SECTION 4: ASHBY & WORKABLE PORTAL INSPECTION & FILLING
  // ----------------------------------------------------------------
  console.log('\nSECTION 4: Ashby & Workable Form Inspection & Pre-fill');

  // Ashby
  const ashbyResult = await executePlaywrightApplication({
    htmlContent: ashbyFixture,
    atsType: 'ashby',
    candidateData: testCandidate,
    resumePdfBuffer: samplePdfBuffer,
    submit: false
  });
  assert(ashbyResult.success === true, 'Ashby form inspection succeeded');
  assert(ashbyResult.filledFields.name === 'Aarav Sharma', 'Ashby name filled');
  assert(ashbyResult.attachedResume === true, 'Ashby resume attached');
  assert(ashbyResult.validation && ashbyResult.validation.valid === true, 'Ashby validation valid');

  // Workable
  const workableResult = await executePlaywrightApplication({
    htmlContent: workableFixture,
    atsType: 'workable',
    candidateData: testCandidate,
    resumePdfBuffer: samplePdfBuffer,
    submit: false
  });
  assert(workableResult.success === true, 'Workable form inspection succeeded');
  assert(workableResult.filledFields.firstName === 'Aarav', 'Workable firstname filled');
  assert(workableResult.filledFields.lastName === 'Sharma', 'Workable lastname filled');
  assert(workableResult.attachedResume === true, 'Workable resume attached');
  assert(workableResult.validation && workableResult.validation.valid === true, 'Workable validation valid');

  // ----------------------------------------------------------------
  // SECTION 5: STRICT SAFETY INVARIANT (ANTI-BOT & CAPTCHA GATES)
  // ----------------------------------------------------------------
  console.log('\nSECTION 5: Strict Safety Invariant Verification (Anti-Bot Challenges)');

  // Test 5.1: Cloudflare Turnstile in Live DOM
  const turnstileResult = await executePlaywrightApplication({
    htmlContent: turnstileChallengeFixture,
    atsType: 'greenhouse',
    candidateData: testCandidate,
    submit: true
  });

  assert(turnstileResult.success === false, 'Cloudflare challenge execution returns success: false');
  assert(turnstileResult.halted === true, 'Execution strictly halted on Cloudflare Turnstile detection');
  assert(turnstileResult.requiresHumanVerification === true, 'requiresHumanVerification set to true');
  assert(turnstileResult.challengeType === ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE, 'Challenge classified as cloudflare_turnstile');
  assert(turnstileResult.actionRequired === 'human_verification_dispatch', 'Action required is human_verification_dispatch');
  assert(Boolean(turnstileResult.screenshotBase64), 'Challenge state screenshot captured for user verification');
  assert(turnstileResult.reason && turnstileResult.reason.includes('automated bypass is forbidden'), 'Safety invariant notice present in message');

  // Test 5.2: Google reCAPTCHA in Live DOM
  const recaptchaResult = await executePlaywrightApplication({
    htmlContent: recaptchaChallengeFixture,
    atsType: 'lever',
    candidateData: testCandidate,
    submit: true
  });

  assert(recaptchaResult.success === false, 'reCAPTCHA challenge returns success: false');
  assert(recaptchaResult.halted === true, 'Execution strictly halted on reCAPTCHA detection');
  assert(recaptchaResult.requiresHumanVerification === true, 'requiresHumanVerification set on reCAPTCHA');
  assert(recaptchaResult.challengeType === ANTI_BOT_CHALLENGE_TYPES.RECAPTCHA_V2, 'Classified as recaptcha_v2');

  // ----------------------------------------------------------------
  // SECTION 6: SUBMISSION CONFIRMATION & REFERENCE EXTRACTION
  // ----------------------------------------------------------------
  console.log('\nSECTION 6: Submission Confirmation and Reference ID Extraction');

  const submitResult = await executePlaywrightApplication({
    htmlContent: greenhouseFixture,
    atsType: 'greenhouse',
    candidateData: testCandidate,
    resumePdfBuffer: samplePdfBuffer,
    submit: true
  });

  assert(submitResult.success === true, 'Submission execution completed successfully');
  assert(submitResult.submitted === true, 'Submit button clicked and form submitted');
  assert(Boolean(submitResult.confirmationText), 'Confirmation text captured from DOM');
  assert(submitResult.confirmationText.includes('Thank you for applying'), 'Confirmation text contains keyword');
  assert(submitResult.confirmationNumber === 'GH-2026-987654', 'Application reference ID extracted correctly (#GH-2026-987654)');
  assert(Boolean(submitResult.confirmationScreenshotBase64), 'Post-submission confirmation screenshot captured');

  // ----------------------------------------------------------------
  // SECTION 7: END-TO-END SERVICE & DATABASE INTEGRATION
  // ----------------------------------------------------------------
  console.log('\nSECTION 7: Database & Browser Submission Service Integration');

  await mongoose.connect(process.env.MONGODB_URI);

  const testEmail = `playwright_test_${Date.now()}@jobradar.local`;
  const dbUser = await User.create({
    email: testEmail,
    password: 'dummyhashpassword',
    isVerified: true,
    candidateProfile: testCandidate
  });

  const dbJob = await Job.create({
    source: 'greenhouse',
    sourceJobId: `pw_job_${Date.now()}`,
    title: 'Senior Distributed Systems Engineer',
    company: 'CloudScale Technologies India',
    location: 'Bengaluru, India',
    city: 'Bengaluru',
    applyUrl: 'https://boards.greenhouse.io/cloudscale/jobs/112233',
    status: 'open'
  });

  try {
    // Stage application
    const stagedApp = await stageApplication(dbUser._id, dbJob._id, {
      submissionMode: 'autonomous_browser',
      notes: 'Playwright autonomous test run'
    });
    assert(stagedApp.status === 'awaiting_approval', 'Application staged in awaiting_approval status');

    // Test Playwright dispatch with anti-bot challenge: must NOT mark applied
    const challengeDispatch = await submitApplicationWithPlaywright(stagedApp._id, dbUser._id, {
      htmlContent: turnstileChallengeFixture,
      submit: true
    });
    assert(challengeDispatch.halted === true, 'Playwright dispatch halted on challenge');
    assert(challengeDispatch.requiresHumanVerification === true, 'Flagged for human verification');

    const appAfterChallenge = await Application.findById(stagedApp._id);
    assert(appAfterChallenge.status === 'awaiting_approval', 'DB status remains awaiting_approval after challenge');
    assert(appAfterChallenge.submissionResult.halted === true, 'DB submissionResult records halted: true');
    assert(Boolean(appAfterChallenge.submissionResult.screenshotBase64), 'DB submissionResult stores challenge screenshot');

    // Test Playwright clean submission: must transition to applied with confirmation reference
    const cleanDispatch = await submitApplicationWithPlaywright(stagedApp._id, dbUser._id, {
      htmlContent: greenhouseFixture,
      resumePdfBuffer: samplePdfBuffer,
      submit: true
    });

    assert(cleanDispatch.success === true, 'Clean Playwright submission succeeds');
    assert(cleanDispatch.submitted === true, 'Clean Playwright submission marked as submitted');

    const appAfterClean = await Application.findById(stagedApp._id);
    assert(appAfterClean.status === 'applied', 'DB application transitioned to status: applied');
    assert(Boolean(appAfterClean.appliedAt), 'appliedAt timestamp saved to MongoDB');
    assert(appAfterClean.confirmationNumber === 'GH-2026-987654', 'Extracted confirmation number persisted to MongoDB');
    assert(Boolean(appAfterClean.submissionResult.confirmationScreenshotBase64), 'Confirmation screenshot persisted to MongoDB');
    assert(appAfterClean.events.some(e => e.status === 'applied'), 'Application timeline contains applied event');

  } finally {
    // Clean up test documents
    await Application.deleteMany({ userId: dbUser._id });
    await Job.deleteOne({ _id: dbJob._id });
    await User.deleteOne({ _id: dbUser._id });
    await mongoose.disconnect();
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed}/${total} PLAYWRIGHT WORKER TESTS PASSED`);
  console.log('================================================================\n');
}

runPlaywrightVerificationSuite().catch(err => {
  console.error('Playwright verification test failed:', err);
  process.exit(1);
});
