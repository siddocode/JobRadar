/**
 * Browser Submission & Assisted Staging Service
 * Coordinates automated form preparation and human-in-the-loop assisted application submission.
 *
 * Adheres strictly to security and anti-bot guidelines:
 * - NEVER attempts to bypass CAPTCHA, Turnstile, or anti-bot challenges.
 * - When anti-bot or complex enterprise authentication is detected, stages pre-filled payload
 *   and safely flags for 1-click human verification dispatch.
 */

const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');
const { tailorCandidateResume } = require('./cvTailorService');
const {
  generateFormBlueprint,
  executeFormBlueprint,
  detectAntiBotChallenge,
  executePlaywrightApplication,
  ANTI_BOT_CHALLENGE_TYPES
} = require('../workers/browserWorker');

/**
 * Prepares standard field mappings from candidate profile for a target ATS.
 */
function mapCandidateToAtsFields(profile = {}, resume = {}) {
  const fullName = profile.name || resume?.name || 'Candidate';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = profile.firstName || nameParts[0] || '';
  const lastName = profile.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName);

  const email = profile.email || resume?.contact?.email || '';
  const phone = profile.phone || resume?.contact?.phone || '';
  const location = profile.city
    ? `${profile.city}, ${profile.country || 'India'}`
    : (profile.country || 'India');

  const linkedin = profile.linkedin || resume?.contact?.linkedin || '';
  const github = profile.github || resume?.contact?.github || '';
  const portfolio = profile.portfolio || profile.website || resume?.contact?.portfolio || '';

  return {
    firstName,
    lastName,
    fullName,
    email,
    phone,
    location,
    linkedin,
    github,
    portfolio,
    website: portfolio,
    totalExperienceYears: profile.totalYearsExperience || 0,
    education: profile.education || '',
    isIndiaResident: profile.isIndiaResident !== false,
    hasUSWorkAuth: Boolean(profile.hasUSWorkAuth),
    headline: profile.headline || '',
    currentCompany: profile.currentCompany || profile.headline || ''
  };
}

/**
 * Stages an application for assisted or automated submission.
 * Pre-fills candidate fields and attaches a tailored resume snapshot.
 *
 * @param {string} userId - User ObjectId
 * @param {string} jobId - Job ObjectId
 * @param {Object} options - { submissionMode, notes, matchScore, status }
 * @returns {Promise<Object>} Staged application record
 */
async function stageApplication(userId, jobId, options = {}) {
  const [user, job] = await Promise.all([
    User.findById(userId),
    Job.findById(jobId)
  ]);

  if (!user) throw new Error('User not found');
  if (!job) throw new Error('Job posting not found');

  const profile = user.candidateProfile || {};
  const submissionMode = options.submissionMode || 'assisted_browser';

  // Generate tailored resume snapshot
  let resumeSnapshot = null;
  let tailoredResult = null;
  try {
    tailoredResult = tailorCandidateResume({
      candidateProfile: profile,
      rawCvText: profile.rawCvText || '',
      job
    });
    resumeSnapshot = {
      tailoredText: JSON.stringify(tailoredResult.tailoredResume || tailoredResult.resume),
      resumeData: tailoredResult.tailoredResume || tailoredResult.resume,
      tailoredAt: new Date()
    };
  } catch (err) {
    console.warn('[SubmissionService] Failed to auto-tailor resume snapshot:', err.message);
  }

  // Generate ATS form blueprint using browserWorker
  const atsType = job.source || 'greenhouse';
  const blueprint = generateFormBlueprint(atsType, job.applyUrl, profile, job);
  const prefilledFields = blueprint.prefilledFields;

  const targetStatus = options.status || 'awaiting_approval';
  const tailoredResumeData = tailoredResult?.tailoredResume || resumeSnapshot?.resumeData || null;

  // Check if an application already exists for this user and job
  let application = await Application.findOne({ userId, jobId });
  if (application) {
    application.submissionMode = submissionMode;
    if (resumeSnapshot) {
      application.resumeSnapshot = resumeSnapshot;
      application.tailoredResumeSnapshot = tailoredResumeData;
    }
    application.prefilledData = prefilledFields;
    application.screeningAnswers = blueprint.screeningAnswers;
    if (options.status) application.status = options.status;
    if (options.matchScore !== undefined) application.matchScore = options.matchScore;
    if (options.notes) application.notes = options.notes;

    application.events.push({
      status: application.status,
      timestamp: new Date(),
      note: 'Updated application with fresh Autopilot prefilled snapshot and ATS blueprint'
    });

    await application.save();
    return application;
  }

  // Create new application record
  application = new Application({
    userId,
    jobId: job._id,
    companyId: job.companyId || null,
    companyName: job.company,
    jobTitle: job.title,
    location: job.location || job.city || 'India',
    city: job.city || null,
    applyUrl: job.applyUrl || '',
    source: job.source || 'direct',
    status: targetStatus,
    submissionMode,
    submissionMethod: options.submissionMethod || 'assisted',
    matchScore: options.matchScore !== undefined ? options.matchScore : 0,
    resumeSnapshot,
    tailoredResumeSnapshot: tailoredResumeData,
    prefilledData: prefilledFields,
    screeningAnswers: blueprint.screeningAnswers,
    notes: options.notes || 'Staged with Autopilot prefilled snapshot',
    events: [
      {
        status: targetStatus,
        timestamp: new Date(),
        note: 'Staged with Autopilot prefilled snapshot and ATS blueprint'
      }
    ]
  });

  await application.save();
  return application;
}

/**
 * Submits or pre-fills an application using the real Playwright browser engine.
 * Launches headless Chromium, navigates to application portal, pre-fills fields,
 * attaches resume PDF, validates required inputs, and captures confirmation/telemetry.
 *
 * Strict Compliance:
 * NEVER bypasses anti-bot challenges. If detected, halts safely and flags for 1-click human dispatch.
 *
 * @param {string} applicationId - Application ObjectId
 * @param {string} userId - User ObjectId
 * @param {Object} options - { resumePdfBuffer, resumePdfPath, submit, simulateChallenge, htmlContent, timeout }
 * @returns {Promise<Object>} Execution result
 */
async function submitApplicationWithPlaywright(applicationId, userId, options = {}) {
  const application = await Application.findOne({ _id: applicationId, userId });
  if (!application) {
    throw new Error('Application not found or unauthorized');
  }

  const [job, user] = await Promise.all([
    Job.findById(application.jobId),
    User.findById(userId)
  ]);
  const profile = user?.candidateProfile || {};

  const atsType = job?.source || application.source || 'greenhouse';
  const applyUrl = application.applyUrl || job?.applyUrl || '';
  const executionTime = new Date();

  // Run Real Playwright Application Runner
  const execution = await executePlaywrightApplication({
    targetUrl: applyUrl,
    atsType,
    candidateData: profile,
    resumePdfBuffer: options.resumePdfBuffer,
    resumePdfPath: options.resumePdfPath,
    submit: options.submit !== false,
    headless: options.headless !== false,
    simulateChallenge: options.simulateChallenge,
    htmlContent: options.htmlContent,
    timeout: options.timeout || 30000,
    screenshotDir: options.screenshotDir
  });

  // Strict Safety Invariant Check
  if (execution.requiresHumanVerification || execution.halted) {
    application.submissionResult = {
      attemptedAt: executionTime,
      success: false,
      halted: true,
      requiresHumanVerification: true,
      challengeType: execution.challengeType,
      challengeName: execution.challengeName,
      matchedSignature: execution.matchedSignature,
      reason: execution.reason,
      confirmationUrl: applyUrl,
      screenshotBase64: execution.screenshotBase64 || null,
      screenshotPath: execution.screenshotPath || null,
      executionLog: execution.executionLog,
      mode: 'assisted_human_verification'
    };

    // Keep status in awaiting_approval (do not advance to applied)
    application.events.push({
      status: application.status,
      timestamp: executionTime,
      note: `Playwright dispatch halted safely: Anti-bot challenge (${execution.challengeType || 'CAPTCHA'}) detected in live browser. Flagged for 1-click human verification dispatch.`
    });

    await application.save();

    return {
      success: false,
      halted: true,
      requiresHumanVerification: true,
      challengeType: execution.challengeType,
      challengeName: execution.challengeName,
      application,
      execution,
      applyUrl,
      message: execution.reason || 'Anti-bot challenge detected. Application safely flagged for 1-click human verification dispatch.'
    };
  }

  // Record Playwright submission result
  application.submissionResult = {
    attemptedAt: executionTime,
    success: true,
    halted: false,
    requiresHumanVerification: false,
    confirmationUrl: applyUrl,
    confirmationNumber: execution.confirmationNumber || null,
    confirmationText: execution.confirmationText || null,
    validation: execution.validation || null,
    screenshotBase64: execution.screenshotBase64 || null,
    confirmationScreenshotBase64: execution.confirmationScreenshotBase64 || null,
    screenshotPath: execution.screenshotPath || null,
    filledFieldsCount: execution.filledFieldsCount || 0,
    attachedResume: execution.attachedResume || false,
    executionLog: execution.executionLog,
    mode: application.submissionMode || 'autonomous_browser'
  };

  if (execution.confirmationNumber) {
    application.confirmationNumber = execution.confirmationNumber;
  }

  if (execution.submitted) {
    application.status = 'applied';
    application.appliedAt = executionTime;
    application.events.push({
      status: 'applied',
      timestamp: executionTime,
      note: `Application submitted via Playwright browser runner to ${application.companyName} (${atsType}). Ref: ${execution.confirmationNumber || 'Confirmed'}`
    });
  } else {
    application.events.push({
      status: application.status,
      timestamp: executionTime,
      note: `Playwright browser runner pre-filled application form for ${application.companyName}. Form ready for final user approval.`
    });
  }

  await application.save();

  return {
    success: true,
    halted: false,
    requiresHumanVerification: false,
    submitted: execution.submitted,
    application,
    execution,
    message: execution.message
  };
}

/**
 * Dispatches application submission.
 * Enforces strict anti-bot safety protocol: halts execution immediately
 * if challenge is encountered and safely flags for 1-click human verification dispatch.
 *
 * @param {string} applicationId - Application ObjectId
 * @param {string} userId - User ObjectId
 * @param {Object} options - { simulateChallenge, html, submissionMode, usePlaywright }
 * @returns {Promise<Object>} Dispatch result
 */
async function dispatchApplication(applicationId, userId, options = {}) {
  // Delegate to Real Playwright Runner if requested
  if (options.usePlaywright || options.browserAutomation || options.runRealBrowser || options.submissionMode === 'autonomous_browser') {
    return submitApplicationWithPlaywright(applicationId, userId, options);
  }

  const application = await Application.findOne({ _id: applicationId, userId });
  if (!application) {
    throw new Error('Application not found or unauthorized');
  }

  const [job, user] = await Promise.all([
    Job.findById(application.jobId),
    User.findById(userId)
  ]);
  const profile = user?.candidateProfile || {};

  const atsType = job?.source || application.source || 'greenhouse';
  const applyUrl = application.applyUrl || job?.applyUrl || '';

  // Generate blueprint
  const blueprint = generateFormBlueprint(atsType, applyUrl, profile, job);

  // Execute blueprint with safety checks
  const execution = executeFormBlueprint(blueprint, options);
  const executionTime = new Date();

  // Strict Safety Invariant Check:
  // If anti-bot challenge is detected, NEVER bypass. Safely flag for 1-click human dispatch.
  if (execution.requiresHumanVerification) {
    application.submissionResult = {
      attemptedAt: executionTime,
      success: false,
      halted: true,
      requiresHumanVerification: true,
      challengeType: execution.challengeType,
      challengeName: execution.challengeName,
      reason: execution.reason,
      confirmationUrl: applyUrl,
      prefilledPayload: blueprint.prefilledFields,
      fillScript: blueprint.clientFillScript,
      executionLog: execution.executionLog,
      mode: 'assisted_human_verification'
    };

    // Keep status in awaiting_approval (do not advance to applied)
    application.events.push({
      status: application.status,
      timestamp: executionTime,
      note: `Dispatch halted safely: Anti-bot challenge (${execution.challengeType || 'CAPTCHA'}) detected. Flagged for 1-click human verification dispatch.`
    });

    await application.save();

    return {
      success: true,
      halted: true,
      requiresHumanVerification: true,
      challengeType: execution.challengeType,
      challengeName: execution.challengeName,
      application,
      prefilled: blueprint.prefilledFields,
      applyUrl,
      fillScript: blueprint.clientFillScript,
      bookmarklet: blueprint.bookmarklet,
      message: execution.reason || 'Anti-bot challenge detected. Application safely flagged for 1-click human verification dispatch.'
    };
  }

  // Clean submission without challenge
  application.submissionResult = {
    attemptedAt: executionTime,
    success: true,
    halted: false,
    requiresHumanVerification: false,
    confirmationUrl: applyUrl,
    prefilledPayload: blueprint.prefilledFields,
    fillScript: blueprint.clientFillScript,
    executionLog: execution.executionLog,
    mode: application.submissionMode
  };

  application.status = 'applied';
  application.appliedAt = executionTime;
  application.events.push({
    status: 'applied',
    timestamp: executionTime,
    note: `Application dispatched to ${application.companyName} via ${atsType} automation blueprint`
  });

  await application.save();

  return {
    success: true,
    halted: false,
    requiresHumanVerification: false,
    application,
    prefilled: blueprint.prefilledFields,
    applyUrl,
    fillScript: blueprint.clientFillScript,
    bookmarklet: blueprint.bookmarklet,
    message: 'Application marked as submitted. ATS target dispatched.'
  };
}

module.exports = {
  stageApplication,
  dispatchApplication,
  submitApplicationWithPlaywright,
  mapCandidateToAtsFields
};
