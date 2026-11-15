/**
 * Recruiter Response & Email Tracking Engine
 * Analyzes communication text (e.g. from recruiter emails or notifications)
 * to automatically detect application acknowledgements, interview invites,
 * assessments, offers, and rejection updates.
 *
 * Supports standalone pattern classification, application lifecycle advancement,
 * real-time event recording, and Google Gmail API OAuth 2.0 inbox synchronization.
 */

const Application = require('../models/Application');

// Priority-ordered rejection patterns.
// Negative phrasing regarding offers or interviews MUST trigger rejection first.
const REJECTION_PATTERNS = [
  /unfortunately/i,
  /not\s+(?:be\s+)?(?:able\s+to\s+)?(?:extend|make|give|offer)\s+(?:you\s+)?(?:an?\s+)?(?:job\s+)?offer/i,
  /unable\s+to\s+(?:offer|extend\s+(?:an?\s+)?offer|proceed|move\s+forward)/i,
  /decided\s+not\s+to\s+(?:move|proceed|extend)/i,
  /will\s+not\s+be\s+moving\s+forward/i,
  /not\s+(?:be\s+)?moving\s+forward/i,
  /not\s+to\s+move\s+forward/i,
  /pursue\s+other\s+candidates/i,
  /moved\s+forward\s+with\s+other/i,
  /other\s+candidates\s+(?:whose|who)/i,
  /regret\s+to\s+inform/i,
  /impressive\s+background(?:.*)not\s+selected/i,
  /not\s+been\s+selected/i,
  /not\s+selected\s+at\s+this\s+time/i,
  /decided\s+to\s+proceed\s+with\s+(?:another|other)/i,
  /position\s+has\s+been\s+filled/i,
  /role\s+has\s+been\s+filled/i,
  /wish\s+you\s+(?:the\s+best|all\s+the\s+best|success)\s+in\s+your\s+(?:job\s+search|future\s+endeavors|career)/i,
  /keep\s+your\s+(?:resume|cv|profile|information)\s+on\s+file/i,
  /at\s+this\s+time[,\s]+we\s+(?:are\s+not|will\s+not)/i,
  /cannot\s+(?:move\s+forward|proceed|make\s+an\s+offer)/i
];

const OFFER_PATTERNS = [
  /offer\s+of\s+employment/i,
  /formal\s+(?:job\s+)?offer/i,
  /job\s+offer/i,
  /pleased\s+to\s+offer\s+you/i,
  /delighted\s+to\s+offer\s+you/i,
  /thrilled\s+to\s+offer\s+you/i,
  /excited\s+to\s+offer\s+you/i,
  /happy\s+to\s+offer\s+you/i,
  /extend\s+(?:you\s+)?an?\s+(?:formal\s+)?(?:job\s+)?offer/i,
  /extending\s+(?:you\s+)?an?\s+(?:formal\s+)?(?:job\s+)?offer/i,
  /offer\s+letter/i,
  /letter\s+of\s+intent/i,
  /welcome\s+to\s+the\s+team/i,
  /congratulations\s+on\s+your\s+offer/i,
  /compensation\s+package\s+and\s+offer/i,
  /employment\s+agreement/i
];

const INTERVIEW_PATTERNS = [
  /invitation\s+to\s+interview/i,
  /invite\s+you\s+to\s+(?:an?\s+)?interview/i,
  /schedule\s+(?:an?|your)\s+interview/i,
  /interview\s+invitation/i,
  /schedule\s+(?:a|a\s+quick)\s+(?:call|discussion|chat|phone\s+screen)/i,
  /phone\s+screen/i,
  /technical\s+interview/i,
  /coding\s+interview/i,
  /system\s+design\s+round/i,
  /hiring\s+manager\s+(?:interview|chat|discussion|round)/i,
  /hr\s+(?:interview|round|discussion)/i,
  /round\s+of\s+interviews/i,
  /next\s+round\s+of\s+interviews/i,
  /availability\s+for\s+(?:an?\s+)?interview/i,
  /virtual\s+onsite/i,
  /panel\s+interview/i,
  /discuss\s+next\s+steps/i,
  /connect\s+with\s+our\s+hiring\s+team/i,
  /calendly\.com/i,
  /google\s+meet\s+(?:link|invite)/i,
  /meet\.google\.com\/[a-z0-9-]+/i,
  /zoom\s+(?:meeting|call|link)/i,
  /teams\.microsoft\.com/i
];

const ASSESSMENT_PATTERNS = [
  /hackerrank/i,
  /codesignal/i,
  /codility/i,
  /take-home\s+(?:assignment|test|task|project)/i,
  /online\s+assessment/i,
  /technical\s+assessment/i,
  /coding\s+challenge/i,
  /coding\s+test/i,
  /pre-interview\s+assessment/i,
  /testgorilla/i,
  /mercer\s*\|\s*mettl|mettl\.com/i,
  /elitmus/i,
  /hackerearth/i,
  /devskiller/i,
  /screening\s+assessment/i,
  /assessment\s+invitation/i
];

const APPLIED_PATTERNS = [
  /thank\s+you\s+for\s+applying/i,
  /thanks\s+for\s+applying/i,
  /application\s+received/i,
  /we\s+have\s+received\s+your\s+application/i,
  /thanks\s+for\s+your\s+interest\s+in/i,
  /application\s+confirmation/i,
  /successfully\s+submitted\s+your\s+application/i,
  /your\s+application\s+(?:has\s+been|was)\s+submitted/i,
  /acknowledgement\s+of\s+application/i,
  /confirming\s+receipt\s+of\s+your\s+application/i,
  /received\s+your\s+application\s+for/i,
  /application\s+status\s*:\s*received/i
];

// Unified pattern groups for external consumption
const STATUS_PATTERNS = [
  { status: 'rejected', keywords: REJECTION_PATTERNS },
  { status: 'offer', keywords: OFFER_PATTERNS },
  { status: 'interview', keywords: INTERVIEW_PATTERNS },
  { status: 'assessment', keywords: ASSESSMENT_PATTERNS },
  { status: 'applied', keywords: APPLIED_PATTERNS }
];

// Stage weight order to prevent accidental stage regression
const STAGE_WEIGHT = {
  discovered: 1,
  shortlisted: 2,
  resume_ready: 3,
  awaiting_approval: 4,
  applied: 5,
  assessment: 6,
  interview: 7,
  offer: 8,
  rejected: 90,
  withdrawn: 91
};

/**
 * Classifies an incoming message into an application stage.
 * Evaluates negative / rejection indicators first to avoid false-positive offers.
 *
 * @param {string} subject - Email / message subject
 * @param {string} body - Email / message body text
 * @returns {Object} Classification result { detected, status, confidence, matchedPattern }
 */
function classifyRecruiterMessage(subject = '', body = '') {
  const content = `${subject}\n${body}`.trim();
  if (!content) {
    return { detected: false, status: null, confidence: 'none' };
  }

  // 1. Check for rejection phrasing first (protects against "not making an offer" false positives)
  for (const pattern of REJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        detected: true,
        status: 'rejected',
        confidence: 'high',
        matchedPattern: pattern.toString()
      };
    }
  }

  // 2. Check for positive offer signals
  for (const pattern of OFFER_PATTERNS) {
    if (pattern.test(content)) {
      return {
        detected: true,
        status: 'offer',
        confidence: 'high',
        matchedPattern: pattern.toString()
      };
    }
  }

  // 3. Check for interview invitations & scheduling
  for (const pattern of INTERVIEW_PATTERNS) {
    if (pattern.test(content)) {
      return {
        detected: true,
        status: 'interview',
        confidence: 'high',
        matchedPattern: pattern.toString()
      };
    }
  }

  // 4. Check for technical assessments & coding challenges
  for (const pattern of ASSESSMENT_PATTERNS) {
    if (pattern.test(content)) {
      return {
        detected: true,
        status: 'assessment',
        confidence: 'high',
        matchedPattern: pattern.toString()
      };
    }
  }

  // 5. Check for application submission acknowledgements
  for (const pattern of APPLIED_PATTERNS) {
    if (pattern.test(content)) {
      return {
        detected: true,
        status: 'applied',
        confidence: 'high',
        matchedPattern: pattern.toString()
      };
    }
  }

  return {
    detected: false,
    status: null,
    confidence: 'none'
  };
}

/**
 * Extracts searchable company tokens and cleaned root names for matching.
 * Handles "Google India Pvt Ltd", "Swiggy (Bundl Technologies)", etc.
 */
function extractCompanyTokens(companyName) {
  if (!companyName) return [];
  const tokens = new Set();
  const trimmed = companyName.trim();
  if (trimmed) tokens.add(trimmed.toLowerCase());

  // Clean corporate suffixes and punctuation
  const stripped = trimmed
    .replace(/\b(Pvt\.?|Private|Ltd\.?|Limited|Inc\.?|Incorporated|Corp\.?|Corporation|LLC|LLP|Technologies|Technology|Tech|Solutions|Services|India|Labs|Software|Global|International|Group)\b/gi, '')
    .replace(/[()[\]{}_,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped && stripped.length >= 2) {
    tokens.add(stripped.toLowerCase());
  }

  // Significant individual tokens (length >= 3)
  const words = stripped.split(' ').filter(w => w.length >= 3 && !/^(and|for|the|via)$/i.test(w));
  words.forEach(w => tokens.add(w.toLowerCase()));

  return Array.from(tokens);
}

/**
 * Scores how well an application matches the incoming email text.
 */
function scoreApplicationMatch(app, from, subject, body) {
  let score = 0;
  const searchableText = `${from} ${subject} ${body}`.toLowerCase();
  const subjectLower = (subject || '').toLowerCase();
  const fromLower = (from || '').toLowerCase();

  const tokens = extractCompanyTokens(app.companyName);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');

    if (fromLower.includes(token)) score += 10;
    if (wordRegex.test(subjectLower)) score += 8;
    else if (subjectLower.includes(token)) score += 5;
    if (wordRegex.test(searchableText)) score += 3;
  }

  // Job title keywords bonus
  if (app.jobTitle) {
    const titleTokens = app.jobTitle
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 4 && !/^(engineer|developer|senior|lead|intern|junior|staff)$/i.test(w));
    for (const t of titleTokens) {
      if (searchableText.includes(t)) {
        score += 2;
      }
    }
  }

  return score;
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
    return {
      linked: false,
      reason: 'No recruiter status patterns detected in message subject or body.'
    };
  }

  // Find user's applications
  const applications = await Application.find({ userId });
  if (!applications || applications.length === 0) {
    return {
      linked: false,
      detectedStatus: classification.status,
      reason: 'No active applications found for user.'
    };
  }

  // Find best-matching application
  let bestApp = null;
  let bestScore = 0;

  for (const app of applications) {
    const score = scoreApplicationMatch(app, from, subject, body);
    if (score > bestScore) {
      bestScore = score;
      bestApp = app;
    }
  }

  if (!bestApp || bestScore < 3) {
    return {
      linked: false,
      detectedStatus: classification.status,
      confidence: classification.confidence,
      reason: 'Could not match email to a specific company application record.'
    };
  }

  const matchedApp = bestApp;
  const previousStatus = matchedApp.status;
  const newStatus = classification.status;
  let stageAdvanced = false;

  // Advance stage if appropriate based on stage hierarchy
  if (newStatus === 'rejected') {
    if (previousStatus !== 'offer' && previousStatus !== 'withdrawn' && previousStatus !== 'rejected') {
      matchedApp.status = 'rejected';
      stageAdvanced = true;
    }
  } else if (newStatus === 'offer') {
    if (previousStatus !== 'offer') {
      matchedApp.status = 'offer';
      stageAdvanced = true;
    }
  } else if (newStatus === 'interview') {
    if (STAGE_WEIGHT[previousStatus] < STAGE_WEIGHT['interview'] && previousStatus !== 'rejected' && previousStatus !== 'withdrawn') {
      matchedApp.status = 'interview';
      stageAdvanced = true;
    }
  } else if (newStatus === 'assessment') {
    if (STAGE_WEIGHT[previousStatus] < STAGE_WEIGHT['assessment'] && previousStatus !== 'rejected' && previousStatus !== 'withdrawn') {
      matchedApp.status = 'assessment';
      stageAdvanced = true;
    }
  } else if (newStatus === 'applied') {
    if (STAGE_WEIGHT[previousStatus] < STAGE_WEIGHT['applied'] && previousStatus !== 'rejected' && previousStatus !== 'withdrawn') {
      matchedApp.status = 'applied';
      stageAdvanced = true;
    }
    if (!matchedApp.appliedAt) {
      matchedApp.appliedAt = new Date(date);
    }
  }

  // Always append an event entry to the timeline
  matchedApp.events.push({
    status: newStatus,
    timestamp: new Date(date),
    note: `Automated recruiter email detection (${classification.status}): "${subject ? subject.slice(0, 100) : 'Recruiter update'}"`
  });

  await matchedApp.save();

  return {
    linked: true,
    applicationId: matchedApp._id,
    company: matchedApp.companyName,
    jobTitle: matchedApp.jobTitle,
    previousStatus,
    newStatus: matchedApp.status,
    detectedStatus: newStatus,
    stageAdvanced,
    subject,
    eventCount: matchedApp.events.length,
    matchedPattern: classification.matchedPattern
  };
}

/**
 * Builds Google OAuth 2.0 authorization URL for read-only Gmail access.
 * Scope: https://www.googleapis.com/auth/gmail.readonly (100% Free tier).
 */
function getGmailAuthUrl(state = '') {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/applications/gmail/callback';

  if (!clientId) {
    return {
      configured: false,
      authUrl: null,
      error: 'GOOGLE_CLIENT_ID is not configured in backend/.env'
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: state || 'jobradar_gmail_oauth'
  });

  return {
    configured: true,
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  };
}

/**
 * Exchanges Google OAuth 2.0 authorization code for access and refresh tokens.
 */
async function exchangeGmailCode(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/applications/gmail/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are missing.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange authorization code');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
    tokenType: data.token_type
  };
}

/**
 * Fetches recent recruiter messages from Gmail using Google REST API v1.
 * Query defaults to recruiter/interview keywords.
 */
async function fetchGmailRecruiterMessages(accessToken, options = {}) {
  const {
    maxResults = 25,
    query = 'subject:(interview OR offer OR assessment OR application OR "thank you for applying" OR HackerRank OR CodeSignal)'
  } = options;

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail API list failed: ${listRes.status} ${errText}`);
  }

  const listData = await listRes.json();
  const messagesSummary = listData.messages || [];
  const parsedMessages = [];

  for (const item of messagesSummary) {
    try {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`;
      const msgRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!msgRes.ok) continue;

      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const getHeader = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const from = getHeader('From');
      const subject = getHeader('Subject');
      const dateStr = getHeader('Date');
      const date = dateStr ? new Date(dateStr) : new Date(parseInt(msg.internalDate, 10) || Date.now());

      // Extract body text
      let bodyText = msg.snippet || '';
      if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText = Buffer.from(part.body.data, 'base64').toString('utf8');
            break;
          }
        }
      }

      parsedMessages.push({
        id: msg.id,
        threadId: msg.threadId,
        from,
        subject,
        date,
        body: bodyText,
        snippet: msg.snippet || ''
      });
    } catch (_) {
      // Continue processing remaining messages
    }
  }

  return parsedMessages;
}

/**
 * Synchronizes user's Gmail inbox with their active applications.
 */
async function syncUserGmailInbox(userId, accessToken, options = {}) {
  const messages = await fetchGmailRecruiterMessages(accessToken, options);
  const results = [];
  let linkedCount = 0;

  for (const email of messages) {
    const res = await processRecruiterEmail(userId, email);
    results.push({ emailId: email.id, subject: email.subject, ...res });
    if (res.linked) linkedCount++;
  }

  return {
    success: true,
    totalMessagesFound: messages.length,
    processedCount: messages.length,
    linkedCount,
    results
  };
}

module.exports = {
  classifyRecruiterMessage,
  processRecruiterEmail,
  getGmailAuthUrl,
  exchangeGmailCode,
  fetchGmailRecruiterMessages,
  syncUserGmailInbox,
  STATUS_PATTERNS,
  extractCompanyTokens
};
