/**
 * Recruiter Response & Email Tracking Engine
 * Analyzes communication text (e.g. from recruiter emails or notifications)
 * to automatically detect application acknowledgements, interview invites,
 * assessments, and rejection updates.
 */

const Application = require('../models/Application');

const STATUS_PATTERNS = [
  {
    status: 'offer',
    keywords: [
      /offer\s+of\s+employment/i,
      /formal\s+offer/i,
      /job\s+offer/i,
      /pleased\s+to\s+offer\s+you/i,
      /offer\s+letter/i,
      /welcome\s+to\s+the\s+team/i
    ]
  },
  {
    status: 'interview',
    keywords: [
      /invitation\s+to\s+interview/i,
      /schedule\s+(?:an?|your)\s+interview/i,
      /interview\s+invitation/i,
      /phone\s+screen/i,
      /technical\s+interview/i,
      /hiring\s+manager\s+chat/i,
      /google\s+meet\s+link/i,
      /zoom\s+meeting/i,
      /calendly\.com/i
    ]
  },
  {
    status: 'assessment',
    keywords: [
      /hackerrank/i,
      /codesignal/i,
      /codility/i,
      /take-home\s+(?:assignment|test|task)/i,
      /online\s+assessment/i,
      /technical\s+assessment/i,
      /coding\s+challenge/i
    ]
  },
  {
    status: 'rejected',
    keywords: [
      /unfortunately/i,
      /not\s+to\s+move\s+forward/i,
      /pursue\s+other\s+candidates/i,
      /moved\s+forward\s+with\s+other/i,
      /impressive\s+background(?:.*)not\s+selected/i,
      /decided\s+to\s+proceed\s+with/i,
      /will\s+not\s+be\s+moving\s+forward/i,
      /position\s+has\s+been\s+filled/i
    ]
  },
  {
    status: 'applied',
    keywords: [
      /thank\s+you\s+for\s+applying/i,
      /application\s+received/i,
      /we\s+have\s+received\s+your\s+application/i,
      /thanks\s+for\s+your\s+interest\s+in/i,
      /application\s+confirmation/i
    ]
  }
];

/**
 * Classifies an incoming message into an application stage.
 *
 * @param {string} subject - Email / message subject
 * @param {string} body - Email / message body text
 * @returns {Object} Classification result
 */
function classifyRecruiterMessage(subject = '', body = '') {
  const content = `${subject}\n${body}`.trim();

  for (const group of STATUS_PATTERNS) {
    for (const pattern of group.keywords) {
      if (pattern.test(content)) {
        return {
          detected: true,
          status: group.status,
          confidence: 'high',
          matchedPattern: pattern.toString()
        };
      }
    }
  }

  return {
    detected: false,
    status: null,
    confidence: 'none'
  };
}

/**
 * Analyzes and links an incoming recruiter message to an active candidate application.
 *
 * @param {string} userId - User ObjectId
 * @param {Object} emailData - { from, subject, body, date }
 * @returns {Promise<Object>} Linked application result
 */
async function processRecruiterEmail(userId, emailData) {
  const { from = '', subject = '', body = '', date = new Date() } = emailData;
  const classification = classifyRecruiterMessage(subject, body);

  if (!classification.detected) {
    return { linked: false, reason: 'No recruiter status patterns detected.' };
  }

  // Find user's applications
  const applications = await Application.find({ userId });
  if (!applications || applications.length === 0) {
    return { linked: false, reason: 'No active applications found for user.' };
  }

  // Find matching application by company name in subject, from, or body
  let matchedApp = null;
  for (const app of applications) {
    const compRegex = new RegExp(`\\b${app.companyName.replace(/[^a-zA-Z0-9]/g, '')}\\b`, 'i');
    if (compRegex.test(subject) || compRegex.test(from) || compRegex.test(body)) {
      matchedApp = app;
      break;
    }
  }

  if (!matchedApp) {
    return {
      linked: false,
      detectedStatus: classification.status,
      reason: 'Could not match email to a specific company application record.'
    };
  }

  // Update application stage if new status is a forward progression
  const previousStatus = matchedApp.status;
  const newStatus = classification.status;

  matchedApp.events.push({
    status: newStatus,
    timestamp: new Date(date),
    note: `Automated recruiter email detection (${classification.status}): "${subject}"`
  });

  // Advance stage if appropriate
  if (previousStatus !== 'offer' && previousStatus !== 'rejected') {
    matchedApp.status = newStatus;
  }

  await matchedApp.save();

  return {
    linked: true,
    applicationId: matchedApp._id,
    company: matchedApp.companyName,
    jobTitle: matchedApp.jobTitle,
    previousStatus,
    newStatus,
    subject
  };
}

module.exports = {
  classifyRecruiterMessage,
  processRecruiterEmail,
  STATUS_PATTERNS
};

