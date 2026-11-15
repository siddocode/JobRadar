/**
 * Browser Automation & Pre-fill Worker
 * Inspects ATS application forms and coordinates assisted or automated form filling.
 *
 * Strict Compliance & Safety Guidelines:
 * 1. NEVER bypass or attempt to solve CAPTCHA, reCAPTCHA, Cloudflare Turnstile, or anti-bot gates.
 * 2. When an anti-bot challenge is encountered, safely halt execution and flag the application
 *    for 1-click assisted completion by the candidate.
 * 3. Never submit applications without candidate consent when in 'assisted' mode.
 */

// Field definitions for standard public ATS providers
const ATS_FORM_SELECTORS = {
  greenhouse: {
    firstName: ['input#first_name', 'input[name="job_application[first_name]"]'],
    lastName: ['input#last_name', 'input[name="job_application[last_name]"]'],
    email: ['input#email', 'input[name="job_application[email]"]'],
    phone: ['input#phone', 'input[name="job_application[phone]"]'],
    resume: ['input#resume', 'input[name="job_application[resume]"]', 'input[type="file"]'],
    linkedin: ['input#job_application_answers_attributes_0_text_value', 'input[autocomplete="custom-question-linkedin-profile"]'],
    website: ['input#job_application_answers_attributes_1_text_value', 'input[autocomplete="custom-question-website"]'],
    submitBtn: ['#submit_app', 'button[type="submit"]', 'input[type="submit"]']
  },
  lever: {
    fullName: ['input[name="name"]', 'input#name'],
    email: ['input[name="email"]', 'input#email'],
    phone: ['input[name="phone"]', 'input#phone'],
    org: ['input[name="org"]'],
    linkedin: ['input[name="urls[LinkedIn]"]'],
    github: ['input[name="urls[GitHub]"]'],
    portfolio: ['input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'],
    resume: ['input[name="resume"]', 'input[type="file"]'],
    submitBtn: ['button[type="submit"]', '#btn-submit']
  },
  workable: {
    fullName: ['input[name="name"]', 'input#firstname'],
    email: ['input[name="email"]'],
    phone: ['input[name="phone"]'],
    summary: ['textarea[name="summary"]'],
    resume: ['input[type="file"]'],
    submitBtn: ['button[data-ui="submit-application"]', 'button[type="submit"]']
  }
};

// Known CAPTCHA and anti-bot challenge selector signatures
const CHALLENGE_SIGNATURES = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="turnstile"]',
  'iframe[src*="hcaptcha"]',
  'div.cf-turnstile',
  'div.g-recaptcha',
  '#challenge-running',
  '#cf-challenge-running'
];

/**
 * Analyzes an ATS target URL and provides pre-filled form mapping and automation instructions.
 *
 * @param {string} atsType - 'greenhouse', 'lever', 'workable', 'ashby'
 * @param {string} applyUrl - Target career portal URL
 * @param {Object} candidateData - Normalized candidate profile
 * @returns {Object} Automation blueprint and pre-fill payload
 */
function generateFormBlueprint(atsType, applyUrl, candidateData) {
  const ats = (atsType || '').toLowerCase();
  const selectors = ATS_FORM_SELECTORS[ats] || ATS_FORM_SELECTORS.greenhouse;

  const fullName = candidateData.fullName || candidateData.name || 'Candidate';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = candidateData.firstName || nameParts[0] || '';
  const lastName = candidateData.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName);

  const prefilledFields = {
    firstName,
    lastName,
    fullName,
    email: candidateData.email || '',
    phone: candidateData.phone || '',
    linkedin: candidateData.linkedin || '',
    github: candidateData.github || '',
    portfolio: candidateData.portfolio || '',
    currentCompany: candidateData.currentCompany || candidateData.headline || '',
    location: candidateData.city ? `${candidateData.city}, India` : 'India'
  };

  const actionPlan = [
    { step: 1, action: 'navigate', url: applyUrl },
    { step: 2, action: 'inspect_challenge', signatures: CHALLENGE_SIGNATURES },
    { step: 3, action: 'prefill_standard_fields', fields: prefilledFields, selectors },
    { step: 4, action: 'verify_attachment', fileType: 'pdf' }
  ];

  return {
    atsType: ats,
    applyUrl,
    canAutoFill: Boolean(ATS_FORM_SELECTORS[ats]),
    requiresHumanVerification: false, // Updated dynamically if challenges found
    prefilledFields,
    actionPlan
  };
}

/**
 * Evaluates whether a target application requires human-in-the-loop completion.
 */
function checkRequiresAssistedSubmission(atsType, url) {
  const urlLower = (url || '').toLowerCase();

  // Enterprise platforms that mandate candidate account login or enterprise SSO
  const requiresCandidateAccount = ['myworkdayjobs.com', 'oraclecloud.com', 'successfactors.com', 'icims.com', 'adp.com'];
  for (const domain of requiresCandidateAccount) {
    if (urlLower.includes(domain)) {
      return {
        isAssistedOnly: true,
        reason: 'Enterprise portal requires candidate SSO/account registration.'
      };
    }
  }

  return {
    isAssistedOnly: false,
    reason: null
  };
}

module.exports = {
  generateFormBlueprint,
  checkRequiresAssistedSubmission,
  ATS_FORM_SELECTORS,
  CHALLENGE_SIGNATURES
};

