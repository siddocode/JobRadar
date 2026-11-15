/**
 * Browser Automation & Pre-fill Worker
 * Inspects ATS application forms and coordinates assisted form filling blueprints and execution logic.
 *
 * Strict Compliance & Safety Guidelines:
 * 1. NEVER bypass or attempt to solve CAPTCHA, reCAPTCHA, Cloudflare Turnstile, or anti-bot gates.
 * 2. When an anti-bot challenge is encountered, safely halt execution and flag the application
 *    for 1-click assisted completion by the candidate.
 * 3. Never submit applications without candidate consent when in 'assisted' mode.
 */

// Known challenge classification types
const ANTI_BOT_CHALLENGE_TYPES = {
  CLOUDFLARE_TURNSTILE: 'cloudflare_turnstile',
  RECAPTCHA_V2: 'recaptcha_v2',
  RECAPTCHA_ENTERPRISE: 'recaptcha_enterprise',
  HCAPTCHA: 'hcaptcha',
  ARKOSE_LABS: 'arkose_funcaptcha',
  DATADOME: 'datadome',
  PERIMETERX: 'perimeterx_human',
  AWS_WAF_CAPTCHA: 'aws_waf_captcha',
  GENERIC_INTERACTIVE_CHALLENGE: 'generic_interactive_challenge'
};

// Detailed anti-bot challenge patterns and selector signatures
const CHALLENGE_PATTERNS = [
  {
    type: ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE,
    name: 'Cloudflare Turnstile',
    selectors: [
      'iframe[src*="challenges.cloudflare.com"]',
      'iframe[src*="turnstile"]',
      'div.cf-turnstile',
      'input[name="cf-turnstile-response"]',
      '#challenge-running',
      '#cf-challenge-running',
      '.cf-browser-verification',
      '#cf-turnstile-wrapper'
    ],
    textPatterns: [
      /challenges\.cloudflare\.com/i,
      /cf-turnstile/i,
      /turnstile\.js/i,
      /cf-challenge-running/i,
      /checking your browser before accessing/i
    ]
  },
  {
    type: ANTI_BOT_CHALLENGE_TYPES.RECAPTCHA_V2,
    name: 'Google reCAPTCHA v2 / Enterprise',
    selectors: [
      'iframe[src*="google.com/recaptcha"]',
      'iframe[src*="recaptcha"]',
      'div.g-recaptcha',
      '.grecaptcha-badge',
      'textarea[name="g-recaptcha-response"]',
      '#g-recaptcha',
      'div[data-sitekey]'
    ],
    textPatterns: [
      /google\.com\/recaptcha/i,
      /g-recaptcha/i,
      /grecaptcha/i,
      /recaptcha\/api\.js/i
    ]
  },
  {
    type: ANTI_BOT_CHALLENGE_TYPES.HCAPTCHA,
    name: 'hCaptcha',
    selectors: [
      'iframe[src*="hcaptcha.com"]',
      'iframe[src*="hcaptcha"]',
      'div.h-captcha',
      'textarea[name="h-captcha-response"]',
      'iframe[data-hcaptcha-widget-id]'
    ],
    textPatterns: [
      /hcaptcha\.com/i,
      /h-captcha/i,
      /hcaptcha\.js/i
    ]
  },
  {
    type: ANTI_BOT_CHALLENGE_TYPES.ARKOSE_LABS,
    name: 'Arkose Labs (FunCaptcha)',
    selectors: [
      'iframe[src*="arkoselabs"]',
      'iframe[src*="funcaptcha"]',
      '#fc-iframe-wrap',
      'div[id*="arkose"]'
    ],
    textPatterns: [
      /arkoselabs\.com/i,
      /funcaptcha/i
    ]
  },
  {
    type: ANTI_BOT_CHALLENGE_TYPES.DATADOME,
    name: 'DataDome Bot Protection',
    selectors: [
      'iframe[src*="datadome"]',
      '#dd-captcha-container',
      'div[class*="datadome"]'
    ],
    textPatterns: [
      /datadome\.co/i,
      /datadome\.js/i,
      /dd\.js/i
    ]
  },
  {
    type: ANTI_BOT_CHALLENGE_TYPES.PERIMETERX,
    name: 'PerimeterX / HUMAN Security',
    selectors: [
      '#px-captcha',
      'div[id*="px-captcha"]',
      'div.px-captcha-container'
    ],
    textPatterns: [
      /px-cdn/i,
      /perimeterx/i,
      /humansecurity/i
    ]
  },
  {
    type: ANTI_BOT_CHALLENGE_TYPES.AWS_WAF_CAPTCHA,
    name: 'AWS WAF Captcha',
    selectors: [
      '#challenge-container',
      'iframe[src*="awswaf"]',
      'div[id*="awswaf-captcha"]'
    ],
    textPatterns: [
      /awswaf/i,
      /aws-waf-captcha/i
    ]
  }
];

// Flat array of all challenge selectors for quick inspection & backward compatibility
const CHALLENGE_SIGNATURES = CHALLENGE_PATTERNS.reduce((acc, p) => acc.concat(p.selectors), []);

// Field definitions for standard public ATS providers
const ATS_FORM_SELECTORS = {
  greenhouse: {
    firstName: [
      'input#first_name',
      'input[name="job_application[first_name]"]',
      'input[id*="first_name"]',
      'input[autocomplete="given-name"]'
    ],
    lastName: [
      'input#last_name',
      'input[name="job_application[last_name]"]',
      'input[id*="last_name"]',
      'input[autocomplete="family-name"]'
    ],
    fullName: [
      'input#name',
      'input[name="job_application[name]"]'
    ],
    email: [
      'input#email',
      'input[name="job_application[email]"]',
      'input[type="email"]',
      'input[autocomplete="email"]'
    ],
    phone: [
      'input#phone',
      'input[name="job_application[phone]"]',
      'input[type="tel"]',
      'input[autocomplete="tel"]'
    ],
    resume: [
      'input#resume',
      'input[name="job_application[resume]"]',
      '#resume_fieldset input[type="file"]',
      'input[type="file"]'
    ],
    coverLetter: [
      'input#cover_letter',
      'textarea#cover_letter_text',
      'input[name="job_application[cover_letter]"]',
      'textarea[name="job_application[cover_letter_text]"]'
    ],
    linkedin: [
      'input#job_application_answers_attributes_0_text_value',
      'input[autocomplete="custom-question-linkedin-profile"]',
      'input[name*="linkedin" i]',
      'input[id*="linkedin" i]'
    ],
    website: [
      'input#job_application_answers_attributes_1_text_value',
      'input[autocomplete="custom-question-website"]',
      'input[name*="website" i]',
      'input[name*="portfolio" i]',
      'input[id*="website" i]'
    ],
    github: [
      'input[autocomplete*="github" i]',
      'input[name*="github" i]',
      'input[id*="github" i]'
    ],
    location: [
      'input#job_application_location',
      'input[name="job_application[location]"]',
      'input[name*="candidate_location" i]'
    ],
    submitBtn: [
      '#submit_app',
      'button#submit_app',
      'button[type="submit"]',
      'input[type="submit"]'
    ]
  },
  lever: {
    fullName: [
      'input[name="name"]',
      'input#name',
      'input[data-qa="name-input"]'
    ],
    email: [
      'input[name="email"]',
      'input#email',
      'input[type="email"]',
      'input[data-qa="email-input"]'
    ],
    phone: [
      'input[name="phone"]',
      'input#phone',
      'input[type="tel"]',
      'input[data-qa="phone-input"]'
    ],
    org: [
      'input[name="org"]',
      'input#org',
      'input[name="current_company"]',
      'input[data-qa="org-input"]'
    ],
    linkedin: [
      'input[name="urls[LinkedIn]"]',
      'input[name*="linkedin" i]',
      'input[data-qa*="linkedin" i]'
    ],
    github: [
      'input[name="urls[GitHub]"]',
      'input[name*="github" i]',
      'input[data-qa*="github" i]'
    ],
    portfolio: [
      'input[name="urls[Portfolio]"]',
      'input[name="urls[Other]"]',
      'input[name*="portfolio" i]',
      'input[name*="urls" i]'
    ],
    resume: [
      'input[name="resume"]',
      'input[type="file"]',
      '#resume-upload-input',
      'input[data-qa="resume-upload"]'
    ],
    comments: [
      'textarea[name="comments"]',
      'textarea#additional-information',
      'textarea[data-qa="additional-cards"]'
    ],
    submitBtn: [
      'button[type="submit"]',
      '#btn-submit',
      'button.template-btn-submit',
      'button[data-qa="btn-submit"]'
    ]
  },
  workable: {
    firstName: [
      'input[name="firstname"]',
      'input[data-ui="firstname"]',
      'input#firstname'
    ],
    lastName: [
      'input[name="lastname"]',
      'input[data-ui="lastname"]',
      'input#lastname'
    ],
    fullName: [
      'input[name="name"]',
      'input[data-ui="name"]'
    ],
    email: [
      'input[name="email"]',
      'input[data-ui="email"]',
      'input#email',
      'input[type="email"]'
    ],
    phone: [
      'input[name="phone"]',
      'input[data-ui="phone"]',
      'input#phone',
      'input[type="tel"]'
    ],
    location: [
      'input[name="address"]',
      'input[data-ui="address"]',
      'input[name="location"]'
    ],
    summary: [
      'textarea[name="summary"]',
      'textarea[data-ui="summary"]',
      'textarea[name="cover_letter"]'
    ],
    resume: [
      'input[type="file"][name="resume"]',
      'input[data-ui="resume-file"]',
      'input[type="file"]',
      'button[data-ui="upload-resume"]'
    ],
    linkedin: [
      'input[name*="linkedin" i]',
      'input[data-ui*="linkedin" i]'
    ],
    portfolio: [
      'input[name*="website" i]',
      'input[name*="portfolio" i]',
      'input[data-ui*="website" i]'
    ],
    github: [
      'input[name*="github" i]',
      'input[data-ui*="github" i]'
    ],
    submitBtn: [
      'button[data-ui="submit-application"]',
      'button[data-ui="application-submit"]',
      'button[type="submit"]'
    ]
  },
  ashby: {
    name: [
      'input[name="name"]',
      'input#name',
      'input[data-qa="name"]'
    ],
    email: [
      'input[name="email"]',
      'input#email',
      'input[data-qa="email"]'
    ],
    phone: [
      'input[name="phoneNumber"]',
      'input[name="phone"]',
      'input#phone'
    ],
    resume: [
      'input[type="file"]',
      'input[name="resume"]'
    ],
    linkedin: [
      'input[name*="linkedin" i]',
      'input[id*="linkedin" i]'
    ],
    github: [
      'input[name*="github" i]',
      'input[id*="github" i]'
    ],
    portfolio: [
      'input[name*="portfolio" i]',
      'input[name*="website" i]'
    ],
    submitBtn: [
      'button[type="submit"]',
      'button[data-qa="submit-application"]'
    ]
  }
};

/**
 * Strict Anti-Bot & CAPTCHA Detector
 * Inspects HTML, text, or DOM selector representations for challenge signatures.
 *
 * SAFETY INVARIANT:
 * Never bypass or compute challenges. Flag immediately for 1-click human verification dispatch.
 *
 * @param {string|Object|Array} input - HTML content, selector list, or context object
 * @returns {Object} Challenge detection result
 */
function detectAntiBotChallenge(input) {
  if (!input) {
    return {
      detected: false,
      challengeType: null,
      challengeName: null,
      requiresHumanDispatch: false,
      safeAction: 'proceed_form_fill',
      instructions: null
    };
  }

  // Handle explicit simulation flag in context object
  if (typeof input === 'object' && input.simulateChallenge) {
    const simType = typeof input.simulateChallenge === 'string'
      ? input.simulateChallenge
      : ANTI_BOT_CHALLENGE_TYPES.CLOUDFLARE_TURNSTILE;
    const pattern = CHALLENGE_PATTERNS.find(p => p.type === simType) || {
      name: 'Simulated Anti-Bot Gate',
      type: simType
    };
    return {
      detected: true,
      challengeType: pattern.type,
      challengeName: pattern.name,
      matchedSignature: 'simulate_challenge_flag',
      requiresHumanDispatch: true,
      safeAction: 'flag_for_human_dispatch',
      instructions: `Anti-bot gate encountered (${pattern.name}). In accordance with strict security invariants, automated bypass is forbidden. The application payload has been staged and safely flagged for 1-click human verification dispatch.`
    };
  }

  const textToScan = typeof input === 'string'
    ? input
    : (input.html || input.body || (Array.isArray(input) ? input.join(' ') : ''));

  // Check each challenge pattern
  for (const pattern of CHALLENGE_PATTERNS) {
    // 1. Selector signature check
    for (const selector of pattern.selectors) {
      if (textToScan.includes(selector)) {
        return {
          detected: true,
          challengeType: pattern.type,
          challengeName: pattern.name,
          matchedSignature: selector,
          requiresHumanDispatch: true,
          safeAction: 'flag_for_human_dispatch',
          instructions: `Anti-bot challenge (${pattern.name}) detected by selector "${selector}". Automated submission halted safely. Flagged for 1-click human verification dispatch.`
        };
      }
    }

    // 2. Regex text pattern check
    if (pattern.textPatterns) {
      for (const regex of pattern.textPatterns) {
        if (regex.test(textToScan)) {
          return {
            detected: true,
            challengeType: pattern.type,
            challengeName: pattern.name,
            matchedSignature: regex.toString(),
            requiresHumanDispatch: true,
            safeAction: 'flag_for_human_dispatch',
            instructions: `Anti-bot challenge (${pattern.name}) detected by pattern match. Automated submission halted safely. Flagged for 1-click human verification dispatch.`
          };
        }
      }
    }
  }

  return {
    detected: false,
    challengeType: null,
    challengeName: null,
    requiresHumanDispatch: false,
    safeAction: 'proceed_form_fill',
    instructions: null
  };
}

/**
 * Generates an injectable browser fill script for assisted 1-click client-side submission.
 * Enforces safety invariant inside the browser: stops immediately if a challenge is rendered.
 */
function generateClientFillScript(blueprint) {
  const payloadJson = JSON.stringify(blueprint.prefilledFields);
  const selectorsJson = JSON.stringify(blueprint.selectors);
  const screeningJson = JSON.stringify(blueprint.screeningAnswers || {});
  const challengeSignaturesJson = JSON.stringify(CHALLENGE_SIGNATURES);

  return `(function() {
    console.log('[JobRadar Autopilot] Initiating assisted form pre-fill for ${blueprint.atsType}...');
    
    // Strict Safety Invariant Check: Never bypass anti-bot challenges
    var challenges = ${challengeSignaturesJson};
    for (var i = 0; i < challenges.length; i++) {
      if (document.querySelector(challenges[i])) {
        console.warn('[JobRadar Safety Invariant] Anti-bot challenge detected on page: ' + challenges[i]);
        alert('[JobRadar Autopilot] Anti-bot challenge detected. Automated bypass is forbidden. Please complete verification directly, then submit.');
        return { halted: true, challengeDetected: true, signature: challenges[i] };
      }
    }

    var fields = ${payloadJson};
    var selectors = ${selectorsJson};
    var screening = ${screeningJson};
    var filledCount = 0;

    function setFieldValue(el, val) {
      if (!el || val === undefined || val === null) return;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.style.borderColor = '#10b981';
      el.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
      filledCount++;
    }

    // Populate standard fields
    for (var fieldKey in selectors) {
      var selList = selectors[fieldKey];
      var val = fields[fieldKey];
      if (!val || !Array.isArray(selList)) continue;
      for (var s = 0; s < selList.length; s++) {
        var el = document.querySelector(selList[s]);
        if (el) {
          setFieldValue(el, val);
          break;
        }
      }
    }

    console.log('[JobRadar Autopilot] Pre-filled ' + filledCount + ' fields safely.');
    return { halted: false, filledCount: filledCount };
  })();`;
}

/**
 * Generates a browser bookmarklet for 1-click assisted application pre-fill.
 */
function generateBookmarklet(blueprint) {
  const script = generateClientFillScript(blueprint);
  return `javascript:${encodeURIComponent(script)}`;
}

/**
 * Analyzes an ATS target URL and provides a complete form-filling blueprint,
 * field mapping, screening answers, and action plan.
 *
 * @param {string} atsType - 'greenhouse', 'lever', 'workable', 'ashby'
 * @param {string} applyUrl - Target career portal URL
 * @param {Object} candidateData - Candidate profile object
 * @param {Object} jobData - Optional Job record
 * @returns {Object} Complete form blueprint
 */
function generateFormBlueprint(atsType, applyUrl, candidateData = {}, jobData = {}) {
  const rawAts = (atsType || '').toLowerCase();
  let ats = 'greenhouse';
  if (rawAts.includes('lever')) ats = 'lever';
  else if (rawAts.includes('workable')) ats = 'workable';
  else if (rawAts.includes('ashby')) ats = 'ashby';
  else if (ATS_FORM_SELECTORS[rawAts]) ats = rawAts;

  const selectors = ATS_FORM_SELECTORS[ats] || ATS_FORM_SELECTORS.greenhouse;

  const fullName = candidateData.fullName || candidateData.name || 'Candidate';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = candidateData.firstName || nameParts[0] || '';
  const lastName = candidateData.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName);

  const city = candidateData.city || 'India';
  const location = candidateData.country ? `${city}, ${candidateData.country}` : `${city}, India`;

  const prefilledFields = {
    firstName,
    lastName,
    fullName,
    email: candidateData.email || '',
    phone: candidateData.phone || '',
    location,
    currentCompany: candidateData.currentCompany || candidateData.headline || '',
    org: candidateData.currentCompany || candidateData.headline || '',
    linkedin: candidateData.linkedin || '',
    github: candidateData.github || '',
    portfolio: candidateData.portfolio || candidateData.website || '',
    website: candidateData.portfolio || candidateData.website || '',
    summary: candidateData.headline || candidateData.summary || '',
    comments: candidateData.headline || ''
  };

  // Standard screening question blueprints
  const isIndiaResident = candidateData.isIndiaResident !== false;
  const screeningAnswers = {
    authorizedToWorkInIndia: isIndiaResident ? 'Yes' : 'No',
    requireVisaSponsorship: 'No',
    totalExperienceYears: String(candidateData.totalYearsExperience || 0),
    noticePeriod: candidateData.noticePeriod || 'Immediate / 30 Days',
    gender: 'Decline to self-identify',
    race: 'Decline to self-identify',
    veteran: 'No',
    disability: 'No'
  };

  const actionPlan = [
    { step: 1, action: 'navigate', url: applyUrl },
    { step: 2, action: 'inspect_challenge', signatures: CHALLENGE_SIGNATURES },
    { step: 3, action: 'halt_if_challenge', rule: 'Strict safety invariant: abort if anti-bot gate detected' },
    { step: 4, action: 'prefill_standard_fields', fields: prefilledFields, selectors },
    { step: 5, action: 'prefill_screening_questions', answers: screeningAnswers },
    { step: 6, action: 'verify_attachment', fileType: 'pdf' },
    { step: 7, action: 'human_review_and_dispatch', mode: 'assisted_dispatch' }
  ];

  const blueprint = {
    atsType: ats,
    applyUrl,
    canAutoFill: Boolean(ATS_FORM_SELECTORS[ats]),
    requiresHumanVerification: false, // Updated dynamically by executeFormBlueprint
    selectors,
    prefilledFields,
    screeningAnswers,
    actionPlan
  };

  blueprint.clientFillScript = generateClientFillScript(blueprint);
  blueprint.bookmarklet = generateBookmarklet(blueprint);

  return blueprint;
}

/**
 * Execution Engine for Form Blueprints
 * Coordinates step-by-step evaluation, challenge inspection, and form execution simulation.
 *
 * Strict Compliance:
 * When a challenge (Cloudflare Turnstile, reCAPTCHA, hCaptcha, Arkose, etc.) is detected:
 * - NEVER bypass or attempt to compute.
 * - Safely halt execution.
 * - Record the challenge type.
 * - Flag for 1-click human verification dispatch.
 *
 * @param {Object} blueprint - Form blueprint from generateFormBlueprint
 * @param {Object} context - Execution context: { html, simulateChallenge, mode }
 * @returns {Object} Execution result
 */
function executeFormBlueprint(blueprint, context = {}) {
  if (!blueprint) {
    throw new Error('Valid blueprint is required for execution');
  }

  const executionLog = [];

  // Step 1: Navigation
  executionLog.push({
    step: 1,
    action: 'navigate',
    status: 'completed',
    target: blueprint.applyUrl
  });

  // Step 2 & 3: Challenge Inspection (Strict Safety Invariant)
  const challengeResult = detectAntiBotChallenge(context.html || context);
  if (challengeResult.detected) {
    executionLog.push({
      step: 2,
      action: 'inspect_challenge',
      status: 'challenge_detected',
      challengeType: challengeResult.challengeType,
      challengeName: challengeResult.challengeName,
      matchedSignature: challengeResult.matchedSignature
    });
    executionLog.push({
      step: 3,
      action: 'halt_if_challenge',
      status: 'halted_safety_invariant_enforced',
      message: challengeResult.instructions
    });

    return {
      success: false,
      halted: true,
      requiresHumanVerification: true,
      challengeType: challengeResult.challengeType,
      challengeName: challengeResult.challengeName,
      reason: challengeResult.instructions,
      executionLog,
      stagedData: blueprint.prefilledFields,
      clientFillScript: blueprint.clientFillScript,
      actionRequired: 'human_verification_dispatch'
    };
  }

  executionLog.push({
    step: 2,
    action: 'inspect_challenge',
    status: 'passed_no_challenge_detected'
  });

  // Check enterprise candidate account requirement
  const assistedCheck = checkRequiresAssistedSubmission(blueprint.atsType, blueprint.applyUrl);
  if (assistedCheck.isAssistedOnly) {
    executionLog.push({
      step: 3,
      action: 'check_portal_type',
      status: 'assisted_only_sso_required',
      reason: assistedCheck.reason
    });
    return {
      success: true,
      halted: false,
      requiresHumanVerification: true,
      requiresAccountLogin: true,
      challengeType: null,
      reason: assistedCheck.reason,
      executionLog,
      stagedData: blueprint.prefilledFields,
      clientFillScript: blueprint.clientFillScript,
      actionRequired: 'assisted_candidate_login_dispatch'
    };
  }

  // Step 4: Pre-fill Standard Fields Validation
  const filledFieldsCount = Object.keys(blueprint.prefilledFields).filter(
    k => Boolean(blueprint.prefilledFields[k])
  ).length;

  executionLog.push({
    step: 4,
    action: 'prefill_standard_fields',
    status: 'completed',
    fieldsCount: filledFieldsCount
  });

  // Step 5: Pre-fill Screening Questions Validation
  const screeningCount = Object.keys(blueprint.screeningAnswers || {}).length;
  executionLog.push({
    step: 5,
    action: 'prefill_screening_questions',
    status: 'completed',
    questionsCount: screeningCount
  });

  // Step 6: Verify Attachment
  executionLog.push({
    step: 6,
    action: 'verify_attachment',
    status: 'ready',
    fileType: 'pdf'
  });

  // Step 7: Ready for Dispatch / Submission
  executionLog.push({
    step: 7,
    action: 'prepare_submission',
    status: 'ready',
    mode: 'assisted_dispatch'
  });

  return {
    success: true,
    halted: false,
    requiresHumanVerification: false,
    challengeType: null,
    executionLog,
    stagedData: blueprint.prefilledFields,
    clientFillScript: blueprint.clientFillScript
  };
}

/**
 * Evaluates whether a target application requires human-in-the-loop completion.
 */
function checkRequiresAssistedSubmission(atsType, url) {
  const urlLower = (url || '').toLowerCase();

  // Enterprise platforms that mandate candidate account login or enterprise SSO
  const requiresCandidateAccount = [
    'myworkdayjobs.com',
    'oraclecloud.com',
    'successfactors.com',
    'icims.com',
    'adp.com',
    'taleo.net'
  ];
  for (const domain of requiresCandidateAccount) {
    if (urlLower.includes(domain)) {
      return {
        isAssistedOnly: true,
        reason: 'Enterprise portal requires candidate SSO or account registration.'
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
  executeFormBlueprint,
  detectAntiBotChallenge,
  checkRequiresAssistedSubmission,
  generateClientFillScript,
  generateBookmarklet,
  ATS_FORM_SELECTORS,
  CHALLENGE_SIGNATURES,
  CHALLENGE_PATTERNS,
  ANTI_BOT_CHALLENGE_TYPES
};
