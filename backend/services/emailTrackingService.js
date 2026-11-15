/**
 * Recruiter Response & Email Tracking Engine
 * Analyzes communication text (e.g. from recruiter emails or notifications)
 * to automatically detect application acknowledgements, interview invites,
 * assessments, offers, and rejection updates.
 *
 * Supports standalone pattern classification, application lifecycle advancement,
 * real-time event recording, Google Gmail API OAuth 2.0 inbox synchronization,
 * automatic token refreshing, and domain-targeted scheduled sync.
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

const RECRUITER_RESPONSE_PATTERNS = [
  /following\s+up\s+on\s+your\s+application/i,
  /reviewed\s+your\s+(?:application|resume|profile|cv)/i,
  /status\s+of\s+your\s+(?:application|candidacy)/i,
  /regarding\s+your\s+application/i,
  /recruiting\s+team\s+at/i,
  /talent\s+acquisition\s+team/i,
  /update\s+on\s+your\s+application/i,
  /profile\s+caught\s+(?:our|my)\s+attention/i,
  /next\s+steps\s+in\s+the\s+process/i
];

// Unified pattern groups for external consumption
const STATUS_PATTERNS = [
  { status: 'rejected', keywords: REJECTION_PATTERNS },
  { status: 'offer', keywords: OFFER_PATTERNS },
  { status: 'interview', keywords: INTERVIEW_PATTERNS },
  { status: 'assessment', keywords: ASSESSMENT_PATTERNS },
  { status: 'applied', keywords: APPLIED_PATTERNS },
  { status: 'recruiter_response', keywords: RECRUITER_RESPONSE_PATTERNS }
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

  // 5. Check for application submission acknowledgements (confirmations)
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

  // 6. Check for general recruiter responses / updates
  for (const pattern of RECRUITER_RESPONSE_PATTERNS) {
    if (pattern.test(content)) {
      return {
        detected: true,
        status: 'applied',
        isRecruiterResponse: true,
        confidence: 'medium',
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
function scoreApplicationMatch(app, from = '', subject = '', body = '') {
  let score = 0;
  const searchableText = `${from} ${subject} ${body}`.toLowerCase();
  const subjectLower = (subject || '').toLowerCase();
  const fromLower = (from || '').toLowerCase();

  // Extract from-domain e.g. "careers@swiggy.in" -> "swiggy.in"
  let fromDomain = '';
  const fromMatch = fromLower.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (fromMatch) {
    fromDomain = fromMatch[1];
  }

  // 1. Company Domain direct match (highest confidence)
  if (app.companyId && typeof app.companyId === 'object' && app.companyId.domain) {
    const compDomain = app.companyId.domain.toLowerCase();
    if (fromDomain && (fromDomain === compDomain || fromDomain.endsWith(`.${compDomain}`))) {
      score += 25;
    }
  }

  // Check applyUrl for domain match
  if (app.applyUrl) {
    try {
      const parsedUrl = new URL(app.applyUrl);
      const host = parsedUrl.hostname.toLowerCase();
      if (fromDomain && (host === fromDomain || fromDomain.endsWith(`.${host}`) || host.endsWith(`.${fromDomain}`))) {
        score += 20;
      }
    } catch (_) {}
  }

  // 2. Company name token matching
  const tokens = extractCompanyTokens(app.companyName);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');

    if (fromDomain.includes(token)) score += 15;
    else if (fromLower.includes(token)) score += 10;

    if (wordRegex.test(subjectLower)) score += 10;
    else if (subjectLower.includes(token)) score += 6;

    if (wordRegex.test(searchableText)) score += 3;
  }

  // 3. Job title keywords bonus
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
 * @param {Object} emailData - { id, emailId, from, subject, body, date }
 * @returns {Promise<Object>} Linked application result
 */
async function processRecruiterEmail(userId, emailData) {
  const { from = '', subject = '', body = '', date = new Date() } = emailData;
  const emailId = emailData.id || emailData.emailId || null;
  const classification = classifyRecruiterMessage(subject, body);

  if (!classification.detected) {
    return {
      linked: false,
      reason: 'No recruiter status patterns detected in message subject or body.'
    };
  }

  // Find user's applications
  const applications = await Application.find({ userId }).populate('companyId');
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

  // Idempotence check: check if this specific email was already processed for this application
  if (emailId) {
    const alreadyLogged = matchedApp.events.some(
      e => e.meta?.emailId === emailId || (e.note && e.note.includes(`[ID:${emailId}]`))
    );
    if (alreadyLogged) {
      return {
        linked: true,
        alreadyProcessed: true,
        applicationId: matchedApp._id,
        company: matchedApp.companyName,
        jobTitle: matchedApp.jobTitle,
        previousStatus,
        newStatus: matchedApp.status,
        detectedStatus: newStatus,
        stageAdvanced: false,
        subject,
        eventCount: matchedApp.events.length,
        reason: 'Message was already processed previously.'
      };
    }
  }

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

  const idSuffix = emailId ? ` [ID:${emailId}]` : '';
  const noteText = classification.isRecruiterResponse
    ? `Recruiter response update: "${subject ? subject.slice(0, 100) : 'Recruiter update'}"${idSuffix}`
    : `Automated recruiter email detection (${classification.status}): "${subject ? subject.slice(0, 100) : 'Recruiter update'}"${idSuffix}`;

  // Always append an event entry to the timeline
  matchedApp.events.push({
    status: newStatus,
    timestamp: new Date(date),
    note: noteText,
    meta: {
      emailId,
      from,
      subject,
      classification: classification.status
    }
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
async function exchangeGmailCode(code, customRedirectUri = null) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/applications/gmail/callback';

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
    expiresIn: data.expires_in || 3600,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
    scope: data.scope,
    tokenType: data.token_type
  };
}

/**
 * Refreshes an expired Google OAuth 2.0 access token using stored refresh token.
 */
async function refreshGmailToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are missing.');
  }

  if (!refreshToken) {
    throw new Error('No refresh token provided for token renewal.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token refresh failed with status ${res.status}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 3600,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
    scope: data.scope,
    tokenType: data.token_type || 'Bearer'
  };
}

/**
 * Revokes an OAuth token cleanly on Google's servers.
 */
async function revokeGmailToken(token) {
  if (!token) return true;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.ok;
  } catch (err) {
    console.warn('[Gmail] Token revocation warning:', err.message);
    return false;
  }
}

/**
 * Retrieves user profile information from Gmail API.
 */
async function fetchGmailUserProfile(accessToken) {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Gmail] Could not fetch user profile:', err.message);
  }
  return null;
}

/**
 * Ensures user has a valid Gmail access token, auto-refreshing if expired.
 *
 * @param {string} userId - User ObjectId string
 * @returns {Promise<string>} Valid access token
 */
async function getValidAccessToken(userId) {
  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found.`);
  }

  const gmail = user.candidateProfile?.gmailIntegration || user.gmailIntegration;
  if (!gmail || !gmail.connected) {
    throw new Error('Gmail integration is not connected for this user.');
  }

  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute renewal buffer

  // If token exists and is valid for at least another 5 minutes
  if (gmail.accessToken && gmail.expiresAt && (gmail.expiresAt - now > bufferMs)) {
    return gmail.accessToken;
  }

  // Token is expired or expiring soon; use refresh token
  if (!gmail.refreshToken) {
    if (gmail.accessToken && gmail.expiresAt && gmail.expiresAt > now) {
      return gmail.accessToken;
    }
    throw new Error('Gmail access token expired and no refresh token is available. Please reconnect Gmail.');
  }

  // Refresh token from Google OAuth
  const refreshed = await refreshGmailToken(gmail.refreshToken);
  gmail.accessToken = refreshed.accessToken;
  gmail.expiresAt = refreshed.expiresAt;
  if (refreshed.refreshToken) {
    gmail.refreshToken = refreshed.refreshToken;
  }

  if (user.candidateProfile) {
    user.candidateProfile.gmailIntegration = gmail;
    user.markModified('candidateProfile');
  }
  if (user.gmailIntegration) {
    user.gmailIntegration = gmail;
  }
  await user.save();

  return gmail.accessToken;
}

/**
 * Extracts distinct applied company domains and company names for a user.
 *
 * @param {string} userId - User ObjectId string
 * @returns {Promise<Object>} { domains, companyNames, count }
 */
async function getAppliedCompanyDomains(userId) {
  const applications = await Application.find({
    userId,
    status: { $nin: ['withdrawn'] }
  }).populate('companyId', 'domain name website careersUrl').lean();

  const domains = new Set();
  const companyNames = new Set();

  for (const app of applications) {
    if (app.companyName) {
      companyNames.add(app.companyName.trim());
    }

    if (app.companyId && typeof app.companyId === 'object' && app.companyId.domain) {
      domains.add(app.companyId.domain.toLowerCase().trim());
    }

    if (app.applyUrl) {
      try {
        const parsedUrl = new URL(app.applyUrl);
        const host = parsedUrl.hostname.toLowerCase();
        const parts = host.split('.');
        if (parts.length >= 2) {
          const rootDomain = parts.slice(-2).join('.');
          const isAts = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com', 'workable.com', 'recruitee.com', 'personio.de', 'personio.com', 'teamtailor.com', 'myworkdayjobs.com'].includes(rootDomain);
          if (!isAts) {
            domains.add(rootDomain);
          }
        }
      } catch (_) {}
    }
  }

  return {
    domains: Array.from(domains),
    companyNames: Array.from(companyNames),
    count: applications.length
  };
}

/**
 * Builds a targeted Gmail search query combining applied company domains and recruiter keywords.
 *
 * @param {Object} options - { domains, companies, unreadOnly, days, customQuery }
 * @returns {string} Gmail query string
 */
function buildGmailRecruiterQuery(options = {}) {
  const {
    domains = [],
    companies = [],
    unreadOnly = false,
    days = 30,
    customQuery = null
  } = options;

  if (customQuery) {
    return customQuery;
  }

  const queryParts = [];

  if (unreadOnly) {
    queryParts.push('is:unread');
  }

  if (days && days > 0) {
    queryParts.push(`newer_than:${days}d`);
  }

  const recruiterKeywords = [
    'interview',
    'offer',
    'assessment',
    'application',
    '"thank you for applying"',
    '"application received"',
    '"next steps"',
    'HackerRank',
    'CodeSignal',
    'Codility',
    '"not moving forward"',
    'unfortunately'
  ].join(' OR ');

  const keywordClause = `subject:(${recruiterKeywords})`;

  if (domains.length > 0 || companies.length > 0) {
    const fromConditions = [];
    if (domains.length > 0) {
      const cleanDomains = domains
        .map(d => d.replace(/[^a-z0-9.-]/gi, ''))
        .filter(Boolean)
        .slice(0, 15);
      if (cleanDomains.length > 0) {
        fromConditions.push(`from:(${cleanDomains.join(' OR ')})`);
      }
    }

    if (companies.length > 0) {
      const companyClauses = companies
        .map(c => `"${c.replace(/["\\]/g, '')}"`)
        .slice(0, 10)
        .join(' OR ');
      if (companyClauses) {
        fromConditions.push(`subject:(${companyClauses})`);
      }
    }

    if (fromConditions.length > 0) {
      queryParts.push(`(${fromConditions.join(' OR ')} OR ${keywordClause})`);
    } else {
      queryParts.push(keywordClause);
    }
  } else {
    queryParts.push(keywordClause);
  }

  return queryParts.join(' ');
}

/**
 * Decodes Gmail message payload body parts recursively.
 */
function decodeMessageBody(payload) {
  if (!payload) return '';

  let body = '';

  // Direct body
  if (payload.body?.data) {
    try {
      const decoded = Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (payload.mimeType === 'text/plain') return decoded;
      if (payload.mimeType === 'text/html') {
        body = decoded.replace(/<[^>]+>/g, ' ');
      }
    } catch (_) {}
  }

  // Multipart parts
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        try {
          return Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        } catch (_) {}
      }
    }

    // Fallback to HTML part stripped of tags
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        try {
          const html = Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          return html.replace(/<[^>]+>/g, ' ');
        } catch (_) {}
      }
      if (part.parts) {
        const nested = decodeMessageBody(part);
        if (nested) return nested;
      }
    }
  }

  return body;
}

/**
 * Fetches recent recruiter messages from Gmail using Google REST API v1.
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
      const labelIds = msg.labelIds || [];
      const isUnread = labelIds.includes('UNREAD');

      // Extract body text
      let bodyText = decodeMessageBody(msg.payload) || msg.snippet || '';

      parsedMessages.push({
        id: msg.id,
        threadId: msg.threadId,
        from,
        subject,
        date,
        isUnread,
        labelIds,
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
 * Supports passing either (userId, accessToken, options) or (userId, options) with auto-token resolution.
 */
async function syncUserGmailInbox(userId, tokenOrOptions = {}, maybeOptions = {}) {
  let accessToken = null;
  let options = {};

  if (typeof tokenOrOptions === 'string') {
    accessToken = tokenOrOptions;
    options = maybeOptions || {};
  } else {
    options = tokenOrOptions || {};
    accessToken = options.accessToken || null;
  }

  if (!accessToken) {
    accessToken = await getValidAccessToken(userId);
  }

  // Extract applied company domains and names for targeted query
  const appliedInfo = await getAppliedCompanyDomains(userId);
  const query = options.query || buildGmailRecruiterQuery({
    domains: options.domains || appliedInfo.domains,
    companies: options.companies || appliedInfo.companyNames,
    unreadOnly: options.unreadOnly || false,
    days: options.days || 30
  });

  const maxResults = options.maxResults || 50;
  const messages = await fetchGmailRecruiterMessages(accessToken, { query, maxResults });

  const results = [];
  let linkedCount = 0;
  let advancedCount = 0;

  for (const email of messages) {
    const res = await processRecruiterEmail(userId, email);
    results.push({ emailId: email.id, subject: email.subject, from: email.from, ...res });
    if (res.linked) {
      linkedCount++;
      if (res.stageAdvanced) {
        advancedCount++;
      }
    }
  }

  // Update user's lastSyncedAt
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (user) {
      if (!user.candidateProfile) user.candidateProfile = {};
      if (!user.candidateProfile.gmailIntegration) user.candidateProfile.gmailIntegration = {};
      user.candidateProfile.gmailIntegration.lastSyncedAt = new Date();
      user.candidateProfile.gmailIntegration.lastSyncResult = {
        totalMessages: messages.length,
        linkedCount,
        advancedCount,
        timestamp: new Date()
      };
      user.markModified('candidateProfile');
      await user.save();
    }
  } catch (err) {
    console.warn('[Gmail] Failed to update sync timestamp on user:', err.message);
  }

  return {
    success: true,
    queryUsed: query,
    totalMessagesFound: messages.length,
    processedCount: messages.length,
    linkedCount,
    advancedCount,
    appliedDomainsTracked: appliedInfo.domains,
    results
  };
}

/**
 * Scheduled runner: sweeps through all users with connected Gmail accounts and synchronizes recent recruiter emails.
 *
 * @param {Object} options - Sync options (e.g. unreadOnly, maxResults, days)
 * @returns {Promise<Object>} Telemetry summary
 */
async function runScheduledGmailSyncForAllUsers(options = {}) {
  const User = require('../models/User');
  const connectedUsers = await User.find({
    $or: [
      { 'candidateProfile.gmailIntegration.connected': true },
      { 'gmailIntegration.connected': true }
    ]
  }).select('_id email candidateProfile gmailIntegration');

  console.log(`[Gmail Sync] Found ${connectedUsers.length} connected user accounts for automated sync.`);

  const summary = {
    usersChecked: connectedUsers.length,
    usersSynced: 0,
    totalMessagesProcessed: 0,
    totalApplicationsLinked: 0,
    totalStagesAdvanced: 0,
    userResults: [],
    errors: []
  };

  for (const user of connectedUsers) {
    try {
      const syncResult = await syncUserGmailInbox(user._id, options);
      summary.usersSynced++;
      summary.totalMessagesProcessed += (syncResult.processedCount || 0);
      summary.totalApplicationsLinked += (syncResult.linkedCount || 0);
      summary.totalStagesAdvanced += (syncResult.advancedCount || 0);
      summary.userResults.push({
        userId: user._id,
        email: user.email,
        messages: syncResult.processedCount || 0,
        linked: syncResult.linkedCount || 0,
        advanced: syncResult.advancedCount || 0
      });
    } catch (err) {
      console.error(`[Gmail Sync] Error syncing user ${user.email} (${user._id}):`, err.message);
      summary.errors.push({
        userId: user._id,
        email: user.email,
        error: err.message
      });
    }
  }

  console.log(`[Gmail Sync] Completed sync for ${summary.usersSynced}/${summary.usersChecked} users. Messages: ${summary.totalMessagesProcessed}, Linked: ${summary.totalApplicationsLinked}.`);
  return summary;
}

let scheduledSyncTimer = null;

/**
 * Starts in-process recurring Gmail sync timer.
 */
function startScheduledGmailSync(intervalMs = 60 * 60 * 1000) {
  if (scheduledSyncTimer) {
    clearInterval(scheduledSyncTimer);
  }
  console.log(`[Gmail Sync] Scheduled recurring Gmail sync initiated (Interval: ${Math.round(intervalMs / 60000)} minutes).`);
  scheduledSyncTimer = setInterval(async () => {
    try {
      await runScheduledGmailSyncForAllUsers({ unreadOnly: true, days: 7 });
    } catch (err) {
      console.error('[Gmail Sync] Scheduled run encountered an error:', err.message);
    }
  }, intervalMs);
  return scheduledSyncTimer;
}

/**
 * Stops in-process recurring Gmail sync timer.
 */
function stopScheduledGmailSync() {
  if (scheduledSyncTimer) {
    clearInterval(scheduledSyncTimer);
    scheduledSyncTimer = null;
  }
}

module.exports = {
  classifyRecruiterMessage,
  processRecruiterEmail,
  getGmailAuthUrl,
  exchangeGmailCode,
  refreshGmailToken,
  revokeGmailToken,
  getValidAccessToken,
  fetchGmailUserProfile,
  fetchGmailRecruiterMessages,
  getAppliedCompanyDomains,
  buildGmailRecruiterQuery,
  syncUserGmailInbox,
  runScheduledGmailSyncForAllUsers,
  startScheduledGmailSync,
  stopScheduledGmailSync,
  STATUS_PATTERNS,
  extractCompanyTokens,
  REJECTION_PATTERNS,
  OFFER_PATTERNS,
  INTERVIEW_PATTERNS,
  ASSESSMENT_PATTERNS,
  APPLIED_PATTERNS,
  RECRUITER_RESPONSE_PATTERNS,
  STAGE_WEIGHT
};
