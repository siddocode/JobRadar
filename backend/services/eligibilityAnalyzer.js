/**
 * Job Eligibility Analyzer Engine
 * Analyzes job postings for:
 * 1. Freshers vs Experience required (years, seniority tier)
 * 2. Key Tech Stack & Skills (languages, frameworks, cloud, data, architecture)
 * 3. Work Mode & Location (Remote vs Hybrid vs On-site)
 * 4. India Work Authorization & US-based Eligibility (Can Indian candidates apply?)
 * 5. Education & Key Takeaways Checklist
 */

const TECH_TAXONOMY = [
  // Languages
  { name: 'Python', regex: /\bpython\b/i, category: 'language' },
  { name: 'JavaScript', regex: /\bjavascript|js\b/i, category: 'language' },
  { name: 'TypeScript', regex: /\btypescript|ts\b/i, category: 'language' },
  { name: 'Java', regex: /\bjava\b(?!script)/i, category: 'language' },
  { name: 'Go / Golang', regex: /\b(golang|go)\b/i, category: 'language' },
  { name: 'C++', regex: /\bc\+\+\b/i, category: 'language' },
  { name: 'C# / .NET', regex: /\b(c#|\.net)\b/i, category: 'language' },
  { name: 'Rust', regex: /\brust\b/i, category: 'language' },
  { name: 'Ruby', regex: /\bruby\b/i, category: 'language' },
  { name: 'Scala', regex: /\bscala\b/i, category: 'language' },
  { name: 'SQL', regex: /\bsql\b/i, category: 'language' },

  // Frontend
  { name: 'React', regex: /\breact(?:\.js)?\b/i, category: 'frontend' },
  { name: 'Next.js', regex: /\bnext(?:\.js)?\b/i, category: 'frontend' },
  { name: 'Vue.js', regex: /\bvue(?:\.js)?\b/i, category: 'frontend' },
  { name: 'Angular', regex: /\bangular\b/i, category: 'frontend' },
  { name: 'GraphQL', regex: /\bgraphql\b/i, category: 'frontend' },
  { name: 'Tailwind CSS', regex: /\btailwind(?:\s*css)?\b/i, category: 'frontend' },

  // Backend & Cloud
  { name: 'Node.js', regex: /\bnode(?:\.js)?\b/i, category: 'backend' },
  { name: 'FastAPI / Django', regex: /\b(fastapi|django|flask)\b/i, category: 'backend' },
  { name: 'Spring Boot', regex: /\bspring(?:\s*boot)?\b/i, category: 'backend' },
  { name: 'AWS', regex: /\baws|amazon web services\b/i, category: 'cloud' },
  { name: 'GCP', regex: /\bgcp|google cloud\b/i, category: 'cloud' },
  { name: 'Azure', regex: /\bazure\b/i, category: 'cloud' },
  { name: 'Docker', regex: /\bdocker\b/i, category: 'cloud' },
  { name: 'Kubernetes (K8s)', regex: /\bkubernetes|k8s\b/i, category: 'cloud' },
  { name: 'Terraform', regex: /\bterraform\b/i, category: 'cloud' },
  { name: 'CI/CD', regex: /\bci[\/-]cd|github actions|jenkins\b/i, category: 'cloud' },
  { name: 'Linux', regex: /\blinux\b/i, category: 'cloud' },

  // Databases & Messaging
  { name: 'PostgreSQL', regex: /\bpostgres(?:ql)?\b/i, category: 'database' },
  { name: 'MongoDB', regex: /\bmongo(?:db)?\b/i, category: 'database' },
  { name: 'Redis', regex: /\bredis\b/i, category: 'database' },
  { name: 'Kafka', regex: /\bkafka\b/i, category: 'database' },

  // AI & Data
  { name: 'Machine Learning', regex: /\bmachine learning|\bml\b/i, category: 'ai' },
  { name: 'Deep Learning', regex: /\bdeep learning\b/i, category: 'ai' },
  { name: 'PyTorch', regex: /\bpytorch\b/i, category: 'ai' },
  { name: 'TensorFlow', regex: /\btensorflow\b/i, category: 'ai' },
  { name: 'LLMs & GenAI', regex: /\bllm[s]?|generative ai|langchain|openai\b/i, category: 'ai' },
  { name: 'NLP', regex: /\bnlp|natural language\b/i, category: 'ai' },
  { name: 'Computer Vision', regex: /\bcomputer vision|\bcv\b/i, category: 'ai' },

  // Architecture & Engineering
  { name: 'System Design', regex: /\bsystem design\b/i, category: 'architecture' },
  { name: 'Microservices', regex: /\bmicroservices\b/i, category: 'architecture' },
  { name: 'Distributed Systems', regex: /\bdistributed systems\b/i, category: 'architecture' },
  { name: 'REST APIs', regex: /\brest(?:ful)? apis?\b/i, category: 'architecture' }
];

const INDIAN_CITIES_REGEX = /\b(bengaluru|bangalore|hyderabad|noida|gurgaon|gurugram|delhi|new delhi|ncr|pune|mumbai|chennai|kolkata|ahmedabad|kochi|indore|chandigarh|jaipur|trivandrum|thiruvananthapuram|coimbatore)\b/i;

/**
 * Clean HTML string into readable text.
 */
function stripHtml(html = '') {
  if (!html) return '';
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyzes a job and generates complete eligibility metadata.
 *
 * @param {Object} job - Mongoose Job document or plain object
 * @returns {Object} Comprehensive structured eligibility result
 */
function analyzeJobEligibility(job) {
  if (!job) return null;

  const title = (job.title || '').trim();
  const rawLoc = (job.locationRaw || job.location || '').trim();
  const country = (job.country || '').trim();
  const city = (job.city || '').trim();
  const state = (job.state || '').trim();
  const company = (job.company || '').trim();
  const workMode = (job.workMode || 'unknown').toLowerCase();
  const rawDesc = job.descriptionHtml || '';
  const cleanDesc = stripHtml(rawDesc);
  const combinedText = `${title} ${rawLoc} ${company} ${cleanDesc}`.toLowerCase();

  // --------------------------------------------------------------------------
  // 1. FRESHERS & EXPERIENCE EVALUATION
  // --------------------------------------------------------------------------
  let minYears = null;
  let maxYears = null;
  let isFresher = false;
  let seniorityLevel = 'Mid-Level';

  // Check explicit title flags
  const isExecutive = /\b(director|vp|vice president|chief|head of|general counsel|partner)\b/i.test(title);
  const isArchitectOrLead = /\b(architect|principal|staff|lead|tech lead|engineering manager)\b/i.test(title);
  const isSenior = /\b(senior|sr\.?|sr\b|lead|iii|iv|v|l5|l6|e5|e6)\b/i.test(title);
  const isFresherTitle = /\b(intern|internship|trainee|fresher|graduate|new grad|campus|apprentice|entry[- ]level|associate software|junior)\b/i.test(title);

  // Search description for years of experience
  // Examples: "0-2 years", "3+ years", "5 to 7 years", "minimum 4 years"
  const expMatch = cleanDesc.match(/\b([0-9]+)\s*(?:[-–to]+|\+)\s*([0-9]*)\s*\+?\s*years?(?:\s+of)?(?:\s+relevant|\s+professional|\s+hands[- ]on|\s+work)?\s+experience/i) ||
                   cleanDesc.match(/\b(?:minimum|at least)\s+([0-9]+)\s*\+?\s*years?/i);

  if (expMatch) {
    minYears = parseInt(expMatch[1], 10);
    if (expMatch[2] && expMatch[2].trim()) {
      maxYears = parseInt(expMatch[2], 10);
    }
  }

  if (isExecutive) {
    seniorityLevel = 'Executive / Director';
    minYears = minYears !== null ? minYears : 10;
    isFresher = false;
  } else if (isArchitectOrLead) {
    seniorityLevel = 'Architect / Principal Lead';
    minYears = minYears !== null ? minYears : 8;
    isFresher = false;
  } else if (isSenior) {
    seniorityLevel = 'Senior Professional';
    minYears = minYears !== null ? minYears : 5;
    isFresher = false;
  } else if (isFresherTitle || (minYears !== null && minYears <= 1)) {
    seniorityLevel = 'Fresher / Early Career';
    minYears = minYears !== null ? minYears : 0;
    isFresher = true;
  } else if (minYears !== null && minYears <= 3) {
    seniorityLevel = 'Junior / Associate';
    isFresher = minYears <= 1;
  } else if (minYears !== null && minYears >= 4) {
    seniorityLevel = 'Mid-Senior Level';
    isFresher = false;
  } else {
    // Default estimate based on title
    seniorityLevel = 'Mid-Level Professional';
    minYears = 2;
    isFresher = false;
  }

  const experienceText = isFresher
    ? '0 - 2 Years (Freshers & College Grads Welcome)'
    : maxYears
      ? `${minYears} - ${maxYears} Years of Experience`
      : `${minYears}+ Years of Professional Experience`;

  // --------------------------------------------------------------------------
  // 2. SKILLS & TECH STACK DETECTION
  // --------------------------------------------------------------------------
  const detectedSkills = [];
  const categorized = {
    languages: [],
    frontend: [],
    backend: [],
    cloud: [],
    database: [],
    ai: [],
    architecture: []
  };

  for (const item of TECH_TAXONOMY) {
    if (item.regex.test(title) || (cleanDesc && item.regex.test(cleanDesc))) {
      detectedSkills.push(item.name);
      const catKey = item.category === 'language' ? 'languages' : item.category;
      if (categorized[catKey]) {
        categorized[catKey].push(item.name);
      }
    }
  }

  // If no skills detected from description (e.g., description was omitted or short), infer from title
  if (detectedSkills.length === 0) {
    if (/frontend|ui|web|react/i.test(title)) {
      detectedSkills.push('JavaScript', 'TypeScript', 'React', 'HTML/CSS', 'REST APIs');
    } else if (/backend|api|server|microservices/i.test(title)) {
      detectedSkills.push('Node.js / Java', 'Python / Go', 'SQL', 'REST APIs', 'Distributed Systems');
    } else if (/machine learning|ml|ai|data scientist/i.test(title)) {
      detectedSkills.push('Python', 'Machine Learning', 'PyTorch / TensorFlow', 'SQL', 'Data Modeling');
    } else if (/devops|cloud|sre|infrastructure|platform/i.test(title)) {
      detectedSkills.push('AWS / GCP', 'Docker', 'Kubernetes', 'Linux', 'CI/CD');
    } else if (/architect/i.test(title)) {
      detectedSkills.push('System Design', 'Cloud Architecture', 'Microservices', 'High Availability');
    } else if (/data engineer/i.test(title)) {
      detectedSkills.push('Python', 'SQL', 'PostgreSQL', 'Kafka', 'Data Pipelines');
    } else {
      detectedSkills.push('Problem Solving', 'Data Structures', 'Git', 'Software Engineering Principles');
    }
  }

  // --------------------------------------------------------------------------
  // 3. WORK MODE & LOCATION
  // --------------------------------------------------------------------------
  let resolvedMode = 'On-site';
  const isExplicitRemote = workMode === 'remote' ||
    /\bremote\b|work from anywhere|wfh|telecommute/i.test(rawLoc) ||
    /\bremote\b/i.test(title);

  const isExplicitHybrid = workMode === 'hybrid' ||
    /\bhybrid\b|flexible office/i.test(rawLoc) ||
    /\bhybrid\b/i.test(title);

  if (isExplicitRemote) {
    resolvedMode = 'Remote';
  } else if (isExplicitHybrid) {
    resolvedMode = 'Hybrid';
  } else if (workMode === 'onsite') {
    resolvedMode = 'On-site';
  } else {
    resolvedMode = rawLoc.toLowerCase().includes('remote') ? 'Remote' : (city ? 'Hybrid / On-site' : 'Flexible');
  }

  // --------------------------------------------------------------------------
  // 4. INDIA HIRING & US WORK AUTHORIZATION POLICY (KEY REQUIREMENT)
  // --------------------------------------------------------------------------
  const hasIndiaLocation = country.toLowerCase() === 'india' ||
    INDIAN_CITIES_REGEX.test(city) ||
    INDIAN_CITIES_REGEX.test(state) ||
    INDIAN_CITIES_REGEX.test(rawLoc);

  const isGlobalOrWorldwideRemote = resolvedMode === 'Remote' && (
    /worldwide|global|anywhere|any location|remote - worldwide|all countries/i.test(rawLoc) ||
    /worldwide|anywhere in the world|work from any country/i.test(cleanDesc)
  );

  const isUSLocation = country.toLowerCase() === 'united states' ||
    country.toLowerCase() === 'us' ||
    country.toLowerCase() === 'usa' ||
    /\b(united states|usa|\bus\b)\b/i.test(rawLoc) ||
    /\b(california|san jose|san francisco|seattle|austin|new york|boston|chicago|texas|washington)\b/i.test(rawLoc);

  let indiaEligibility = {};

  if (hasIndiaLocation) {
    // DIRECT INDIA ROLE
    const officeLocationName = city ? `${city}${state ? `, ${state}` : ''}, India` : (rawLoc || 'India');
    indiaEligibility = {
      status: 'direct_india',
      canIndiansApply: true,
      badgeText: 'Direct India Opening',
      badgeTone: 'success',
      badgeIcon: '🇮🇳',
      verdictTitle: '100% Eligible: Direct India Entity Hire',
      explanation: `This position is officially based at ${company}'s India office (${officeLocationName}). Indian citizens and residents are fully eligible to apply with local payroll, EPF, health insurance, and standard Indian employee benefits.`,
      workplaceSummary: `${resolvedMode} at ${officeLocationName}`
    };
  } else if (isGlobalOrWorldwideRemote) {
    // WORLDWIDE REMOTE
    indiaEligibility = {
      status: 'eligible_worldwide',
      canIndiansApply: true,
      badgeText: 'Global Remote (India Allowed)',
      badgeTone: 'success',
      badgeIcon: '🌐',
      verdictTitle: 'Eligible: Worldwide Remote Role',
      explanation: `${company} supports global remote hiring. Candidates residing in India are welcome to apply as international contractors or through an Employer of Record (EOR like Deel, Remote, or local entity).`,
      workplaceSummary: 'Global Remote (Work from India)'
    };
  } else if (isUSLocation) {
    // US RESTRICTED ROLE
    const requiresUSSponsorshipNotice = /must be legally authorized to work in the united states|u\.?s\.? citizens|green card|no visa sponsorship|authorized to work in the u\.?s\./i.test(cleanDesc);

    indiaEligibility = {
      status: 'restricted_us',
      canIndiansApply: false,
      badgeText: 'US Work Auth Required',
      badgeTone: 'warning',
      badgeIcon: '🇺🇸',
      verdictTitle: 'Restricted: Existing US Work Authorization Required',
      explanation: `This position is based in the United States (${rawLoc || 'USA'}). Indian candidates residing in India cannot work remotely from India for this position. To be eligible, you must already hold valid US work authorization (US Citizen, Permanent Resident/Green Card, or valid H-1B transfer) and be located in or relocating to the US.`,
      workplaceSummary: `${resolvedMode} in ${rawLoc || 'United States'}`
    };
  } else if (country && country.toLowerCase() !== 'india' && country.toLowerCase() !== 'unknown') {
    // OTHER INTERNATIONAL ROLE (e.g. UK, Germany, Canada, Singapore)
    indiaEligibility = {
      status: 'restricted_other',
      canIndiansApply: false,
      badgeText: `${country} Local Only`,
      badgeTone: 'warning',
      badgeIcon: '🌍',
      verdictTitle: `Requires ${country} Work Authorization`,
      explanation: `This role is hosted by ${company}'s ${country} entity (${rawLoc || country}). Applicants must have local right-to-work in ${country} or qualify for company-sponsored relocation. Cross-border remote from India is generally not supported for this role.`,
      workplaceSummary: `${resolvedMode} in ${rawLoc || country}`
    };
  } else {
    // UNKNOWN / GENERAL
    indiaEligibility = {
      status: 'conditional',
      canIndiansApply: true,
      badgeText: 'Check ATS Portal',
      badgeTone: 'info',
      badgeIcon: 'ℹ️',
      verdictTitle: 'Location-Dependent Eligibility',
      explanation: `Location details are unspecified on the source board. If ${company} has an Indian entity or offers worldwide remote, Indian applicants can apply directly on the ATS portal.`,
      workplaceSummary: resolvedMode
    };
  }

  // --------------------------------------------------------------------------
  // 5. EDUCATION & DEGREE
  // --------------------------------------------------------------------------
  let education = 'B.E. / B.Tech / BCA / MCA / BS in Computer Science or equivalent practical experience';
  if (/master|phd|m\.?s\.? in/i.test(cleanDesc)) {
    education = "Master's or PhD degree in Computer Science, AI, or quantitative discipline";
  } else if (/high school|no degree required/i.test(cleanDesc)) {
    education = 'Practical experience and demonstrated project portfolio (No specific degree strictly required)';
  }

  // --------------------------------------------------------------------------
  // 6. KEY TAKEAWAYS / ELIGIBILITY HIGHLIGHTS
  // --------------------------------------------------------------------------
  const keyHighlights = [
    {
      label: 'Experience Fit',
      icon: isFresher ? '🎓' : '💼',
      value: experienceText,
      subtext: isFresher ? 'Freshers & entry-level applicants meet the minimum requirement' : `${seniorityLevel} with relevant track record`
    },
    {
      label: 'India Candidate Status',
      icon: indiaEligibility.badgeIcon,
      value: indiaEligibility.verdictTitle,
      subtext: indiaEligibility.status === 'direct_india' || indiaEligibility.status === 'eligible_worldwide'
        ? 'Indian applicants are fully eligible to apply'
        : 'Requires existing local work visa or legal authorization'
    },
    {
      label: 'Work Mode & Presence',
      icon: resolvedMode === 'Remote' ? '💻' : (resolvedMode === 'Hybrid' ? '🏢' : '📍'),
      value: `${resolvedMode} (${rawLoc || city || 'Flexible'})`,
      subtext: resolvedMode === 'Remote' ? 'No daily commute required' : 'Office presence as per company policy'
    },
    {
      label: 'Core Tech Stack',
      icon: '⚡',
      value: detectedSkills.slice(0, 4).join(', '),
      subtext: `Total ${detectedSkills.length} relevant technical skills identified`
    }
  ];

  return {
    jobId: job._id || job.sourceJobId,
    title,
    company,
    source: job.source,
    applyUrl: job.applyUrl,
    seniority: {
      isFresher,
      level: seniorityLevel,
      minYears,
      maxYears,
      experienceText
    },
    skills: detectedSkills,
    skillsByCategory: categorized,
    workplace: {
      mode: resolvedMode,
      locationDisplay: rawLoc || city || 'Unspecified',
      city,
      country: country || (hasIndiaLocation ? 'India' : 'Unspecified')
    },
    indiaEligibility,
    education,
    keyHighlights,
    analyzedAt: new Date().toISOString()
  };
}

module.exports = {
  analyzeJobEligibility,
  stripHtml
};
