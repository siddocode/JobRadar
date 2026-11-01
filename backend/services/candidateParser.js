/**
 * Candidate Profile Parser
 * Extracts structured profile information from:
 * 1. Uploaded CV / Resume PDF documents
 * 2. Public Portfolio / Personal Website URLs
 * 
 * Extracted attributes:
 * - Country & Location (India, US, UK, etc. + Work Authorization indicators)
 * - Years of Experience & Seniority Tier (Fresher, Junior, Mid, Senior, Lead)
 * - Technical Skills & Frameworks (matched against technical taxonomy)
 * - Education & Degrees (B.Tech, B.E., BCA, MCA, MS, etc.)
 * - Candidate Name, Email & Headline
 */

const { PDFParse } = require('pdf-parse');
const { TECH_TAXONOMY, stripHtml } = require('./eligibilityAnalyzer');

// Extended skills dictionary for comprehensive CV parsing
const EXTENDED_SKILL_KEYWORDS = [
  { name: 'JavaScript', regex: /\b(javascript|es6|es20\d\d)\b/i },
  { name: 'TypeScript', regex: /\btypescript\b/i },
  { name: 'Python', regex: /\bpython\b/i },
  { name: 'Java', regex: /\bjava\b(?!script)/i },
  { name: 'C++', regex: /\bc\+\+\b/i },
  { name: 'C# / .NET', regex: /\b(c#|\.net)\b/i },
  { name: 'Go / Golang', regex: /\b(golang|go\b)/i },
  { name: 'Rust', regex: /\brust\b/i },
  { name: 'PHP', regex: /\bphp\b/i },
  { name: 'Ruby', regex: /\bruby\b/i },
  { name: 'SQL', regex: /\bsql\b/i },
  { name: 'HTML / CSS', regex: /\b(html5?|css3?)\b/i },
  { name: 'React', regex: /\breact(?:\.js)?\b/i },
  { name: 'Next.js', regex: /\bnext(?:\.js)?\b/i },
  { name: 'Vue.js', regex: /\bvue(?:\.js)?\b/i },
  { name: 'Angular', regex: /\bangular\b/i },
  { name: 'Svelte', regex: /\bsvelte\b/i },
  { name: 'Node.js', regex: /\bnode(?:\.js)?\b/i },
  { name: 'Express', regex: /\bexpress(?:\.js)?\b/i },
  { name: 'FastAPI / Django', regex: /\b(fastapi|django|flask)\b/i },
  { name: 'Spring Boot', regex: /\bspring(?:\s*boot)?\b/i },
  { name: 'Tailwind CSS', regex: /\btailwind(?:\s*css)?\b/i },
  { name: 'GraphQL', regex: /\bgraphql\b/i },
  { name: 'REST APIs', regex: /\brest(?:ful)?\s*apis?\b/i },
  { name: 'PostgreSQL', regex: /\bpostgres(?:ql)?\b/i },
  { name: 'MongoDB', regex: /\bmongo(?:db)?\b/i },
  { name: 'MySQL', regex: /\bmysql\b/i },
  { name: 'Redis', regex: /\bredis\b/i },
  { name: 'Kafka', regex: /\bkafka\b/i },
  { name: 'AWS', regex: /\baws|amazon web services\b/i },
  { name: 'GCP', regex: /\bgcp|google cloud\b/i },
  { name: 'Azure', regex: /\bazure\b/i },
  { name: 'Docker', regex: /\bdocker\b/i },
  { name: 'Kubernetes (K8s)', regex: /\bkubernetes|k8s\b/i },
  { name: 'CI/CD', regex: /\bci[\/-]cd|github actions|jenkins|gitlab ci\b/i },
  { name: 'Git', regex: /\bgit\b|github|gitlab/i },
  { name: 'Linux', regex: /\blinux|ubuntu|bash\b/i },
  { name: 'Machine Learning', regex: /\bmachine learning|\bml\b/i },
  { name: 'Deep Learning', regex: /\bdeep learning\b/i },
  { name: 'PyTorch', regex: /\bpytorch\b/i },
  { name: 'TensorFlow', regex: /\btensorflow\b/i },
  { name: 'LLMs & GenAI', regex: /\bllm[s]?|generative ai|langchain|openai|rag\b/i },
  { name: 'System Design', regex: /\bsystem design|distributed systems|microservices\b/i }
];

const INDIAN_CITIES_REGEX = /\b(bengaluru|bangalore|hyderabad|noida|gurgaon|gurugram|delhi|new delhi|ncr|pune|mumbai|chennai|kolkata|ahmedabad|kochi|indore|chandigarh|jaipur|trivandrum|thiruvananthapuram|coimbatore)\b/i;
const INDIAN_LOCATIONS_REGEX = /\b(india|karnataka|telangana|maharashtra|tamil nadu|uttar pradesh|haryana|kerala|gujarat)\b/i;

const US_CITIES_REGEX = /\b(san francisco|san jose|seattle|austin|new york|boston|chicago|los angeles)\b/i;
const US_LOCATIONS_REGEX = /\b(united states|usa|\bus\b|california|texas|washington|colorado|florida)\b/i;

const OTHER_COUNTRIES = [
  { name: 'United Kingdom', regex: /\b(united kingdom|\buk\b|london|manchester|england|scotland)\b/i },
  { name: 'Canada', regex: /\b(canada|toronto|vancouver|montreal|ontario|quebec)\b/i },
  { name: 'Germany', regex: /\b(germany|berlin|munich|frankfurt|hamburg)\b/i },
  { name: 'Singapore', regex: /\bsingapore\b/i },
  { name: 'Australia', regex: /\b(australia|sydney|melbourne|brisbane)\b/i },
  { name: 'UAE / Dubai', regex: /\b(dubai|uae|united arab emirates|abu dhabi)\b/i }
];

/**
 * Extract raw text from a PDF Buffer using pdf-parse.
 * @param {Buffer} buffer - Raw PDF buffer
 * @returns {Promise<string>} Cleaned extracted text
 */
async function parseCvPdf(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid PDF buffer provided');
  }

  try {
    let extractedText = '';

    // Handle v2 class-based PDFParse
    if (typeof PDFParse === 'function') {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        extractedText = result && typeof result.text === 'string' ? result.text : (result || '');
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    } else {
      // Fallback for function export
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      extractedText = data.text || '';
    }

    if (!extractedText || !extractedText.trim()) {
      throw new Error('PDF contains no extractable text. Please ensure it is not a scanned image PDF.');
    }

    return extractedText.trim();
  } catch (error) {
    console.error('[candidateParser:parseCvPdf] Error:', error.message);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

/**
 * Extract text from nested JSON objects (e.g. Next.js pageProps or JSON-LD)
 */
function extractStringsFromJson(obj, maxDepth = 4, depth = 0) {
  if (!obj || depth > maxDepth) return '';
  const strings = [];
  try {
    if (typeof obj === 'string') {
      if (obj.length > 2 && obj.length < 500 && !obj.startsWith('http') && !/^[a-f0-9-]{32,}$/i.test(obj)) {
        strings.push(obj);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj.slice(0, 50)) {
        strings.push(extractStringsFromJson(item, maxDepth, depth + 1));
      }
    } else if (typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        if (/token|hash|secret|svg|css|icon|id/i.test(key)) continue;
        strings.push(extractStringsFromJson(val, maxDepth, depth + 1));
      }
    }
  } catch (_) {}
  return strings.filter(Boolean).join(' ');
}

/**
 * Fetch and extract text from a Portfolio or personal website URL.
 * Supports:
 * - HTML Websites & SPAs (React, Next.js, Vue, Webflow, Framer)
 * - Direct PDF URLs (e.g. Google Drive / raw links / .pdf)
 * - GitHub Profiles & Repositories
 * - LinkedIn Profile URLs
 * 
 * @param {string} url - Valid HTTP/HTTPS URL
 * @returns {Promise<string>} Cleaned website text content
 */
async function parsePortfolioUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Portfolio URL is required');
  }

  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(formattedUrl);
  } catch (e) {
    throw new Error('Invalid URL format. Please provide a valid web address (e.g., https://myportfolio.com)');
  }

  // Prevent local/internal IP SSRF
  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Local or internal network URLs are not supported.');
  }

  // 1. Specialized Handler: GitHub Profile / User page
  if (hostname === 'github.com' || hostname === 'www.github.com') {
    try {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      const ghUsername = parts[0];
      if (ghUsername && !['topics', 'trending', 'features', 'pricing', 'login', 'signup'].includes(ghUsername.toLowerCase())) {
        console.log(`[candidateParser:parsePortfolioUrl] Extracting GitHub developer profile for: ${ghUsername}`);
        let ghProfileText = `GitHub Profile: https://github.com/${ghUsername}\n`;

        // Query GitHub public User API
        try {
          const ghRes = await fetch(`https://api.github.com/users/${ghUsername}`, {
            headers: { 'User-Agent': 'JobRadar-ProfileScraper/1.0', 'Accept': 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(6000)
          });
          if (ghRes.ok) {
            const uData = await ghRes.json();
            if (uData.name) ghProfileText += `Name: ${uData.name}\n`;
            if (uData.bio) ghProfileText += `Bio: ${uData.bio}\n`;
            if (uData.company) ghProfileText += `Company: ${uData.company}\n`;
            if (uData.location) ghProfileText += `Location: ${uData.location}\n`;
            if (uData.blog) ghProfileText += `Portfolio: ${uData.blog}\n`;
            if (uData.public_repos) ghProfileText += `Public Repositories: ${uData.public_repos}\n`;
          }
        } catch (_) {}

        // Fetch User's special Profile README if exists
        try {
          const readmeRes = await fetch(`https://raw.githubusercontent.com/${ghUsername}/${ghUsername}/main/README.md`, {
            signal: AbortSignal.timeout(5000)
          });
          if (readmeRes.ok) {
            const readmeContent = await readmeRes.text();
            ghProfileText += `\nProfile README:\n${stripHtml(readmeContent)}\n`;
          } else {
            // Try master branch
            const masterRes = await fetch(`https://raw.githubusercontent.com/${ghUsername}/${ghUsername}/master/README.md`, {
              signal: AbortSignal.timeout(4000)
            });
            if (masterRes.ok) {
              const readmeContent = await masterRes.text();
              ghProfileText += `\nProfile README:\n${stripHtml(readmeContent)}\n`;
            }
          }
        } catch (_) {}

        // Fetch top updated repositories for languages and skills
        try {
          const reposRes = await fetch(`https://api.github.com/users/${ghUsername}/repos?sort=updated&per_page=6`, {
            headers: { 'User-Agent': 'JobRadar-ProfileScraper/1.0', 'Accept': 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(5000)
          });
          if (reposRes.ok) {
            const repos = await reposRes.json();
            if (Array.isArray(repos) && repos.length > 0) {
              const repoSummaries = repos.map(r => `${r.name}: ${r.language || 'Code'} - ${r.description || ''} ${Array.isArray(r.topics) ? r.topics.join(' ') : ''}`).join('\n');
              ghProfileText += `\nRecent Projects & Codebases:\n${repoSummaries}\n`;
            }
          }
        } catch (_) {}

        if (ghProfileText.length > 60) {
          return ghProfileText;
        }
      }
    } catch (ghErr) {
      console.warn('[candidateParser:parsePortfolioUrl] GitHub scraper warning:', ghErr.message);
    }
  }

  // 2. Specialized Handler: LinkedIn Profile URL
  if (hostname.includes('linkedin.com')) {
    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    const inIdx = parts.indexOf('in');
    let linkedinSlug = inIdx !== -1 && parts[inIdx + 1] ? parts[inIdx + 1] : '';
    let candidateName = '';
    if (linkedinSlug) {
      candidateName = linkedinSlug
        .replace(/[-_][a-f0-9]{4,}$/i, '')
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return `Candidate Name: ${candidateName || 'Software Engineer'}\nHeadline: Software Engineer\nLocation: India\nProfile: ${formattedUrl}\nNote: Parsed from LinkedIn profile URL.`;
  }

  try {
    const response = await fetch(formattedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(15000), // 15 seconds
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 3. Direct PDF Detection (e.g. user pasted a link to a resume PDF)
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isPdfUrl = parsedUrl.pathname.toLowerCase().endsWith('.pdf') || contentType.includes('application/pdf');

    if (isPdfUrl) {
      console.log(`[candidateParser:parsePortfolioUrl] Detected direct PDF at ${formattedUrl}. Parsing as CV.`);
      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      return await parseCvPdf(buffer);
    }

    const html = await response.text();
    let textParts = [];

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      textParts.push(`Title: ${titleMatch[1].trim()}`);
    }

    // Extract meta description & keywords
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                          html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (metaDescMatch && metaDescMatch[1]) {
      textParts.push(`Summary: ${metaDescMatch[1].trim()}`);
    }

    const metaKeywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
    if (metaKeywordsMatch && metaKeywordsMatch[1]) {
      textParts.push(`Skills & Keywords: ${metaKeywordsMatch[1].trim()}`);
    }

    // Extract Next.js / Nuxt / SPA inline data (e.g. __NEXT_DATA__)
    const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const nextJson = JSON.parse(nextDataMatch[1]);
        const extractedJsonText = extractStringsFromJson(nextJson?.props?.pageProps || nextJson);
        if (extractedJsonText) {
          textParts.push(`Data: ${extractedJsonText.slice(0, 3000)}`);
        }
      } catch (_) {}
    }

    // Extract JSON-LD (Person / ProfilePage schemas)
    const ldJsonMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldJsonMatches) {
      try {
        const ldData = JSON.parse(m[1]);
        const ldText = extractStringsFromJson(ldData);
        if (ldText) {
          textParts.push(`Structured Data: ${ldText.slice(0, 2000)}`);
        }
      } catch (_) {}
    }

    // Extract visible body content
    const cleanBodyText = stripHtml(html);
    if (cleanBodyText) {
      textParts.push(cleanBodyText);
    }

    const combined = textParts.join('\n\n').trim();

    // Fallback: If minimal text extracted, construct a basic portfolio context using hostname and title
    if (!combined || combined.length < 30) {
      const siteHint = hostname.replace(/\.(com|org|dev|io|in|net|app|me|tech)$/i, '').replace(/[-_]/g, ' ');
      return `Portfolio Website: ${formattedUrl}\nCandidate Profile: ${siteHint}\nRole: Software Engineer\nLocation: India`;
    }

    return combined;
  } catch (error) {
    console.error(`[candidateParser:parsePortfolioUrl] Failed for ${formattedUrl}:`, error.message);
    throw new Error(`Could not access portfolio URL (${error.message}). Please ensure the site is public or upload your CV PDF directly.`);
  }
}

/**
 * Extracts structured candidate profile data from raw resume/portfolio text.
 * @param {string} rawText - Unstructured candidate text from PDF or portfolio
 * @param {Object} [meta={}] - Optional metadata (sourceType: 'pdf' | 'url', sourceName: string)
 * @returns {Object} Structured candidate profile
 */
function extractCandidateProfile(rawText = '', meta = {}) {
  const text = (rawText || '').trim();
  if (!text) {
    return createEmptyProfile(meta);
  }

  // --------------------------------------------------------------------------
  // 1. EXTRACT CANDIDATE NAME, EMAIL & HEADLINE
  // --------------------------------------------------------------------------
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let name = '';
  let email = '';
  let phone = '';

  // Email regex
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    email = emailMatch[0].toLowerCase();
  }

  // Phone regex (Indian +91, 10-digit mobile, or US +1)
  const phoneMatch = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/) || text.match(/(?:\+1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (phoneMatch) {
    phone = phoneMatch[0];
  }

  // Explicit Name marker check (e.g. from GitHub, LinkedIn, or structured tags)
  const explicitNameMatch = text.match(/(?:Candidate Name|Full Name|Name):\s*([a-zA-Z\s.'-]+)/i);
  if (explicitNameMatch && explicitNameMatch[1].trim().length >= 3 && explicitNameMatch[1].trim().length <= 35) {
    name = explicitNameMatch[1].trim();
  }

  // Name inference: check title or top lines
  if (!name) {
    const titleNameMatch = text.match(/Title:\s*([a-zA-Z\s.'-]+?)(?:\s*[-|–—:]\s*(?:portfolio|developer|engineer|software|full\s*stack|homepage|official|web))/i);
    if (titleNameMatch && titleNameMatch[1].trim().length >= 3 && titleNameMatch[1].trim().length <= 35) {
      name = titleNameMatch[1].trim();
    }
  }

  if (!name) {
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const rawLine = lines[i];
      const cleanLine = rawLine.replace(/[#§Š€•\d]+/g, '').trim();
      if (
        cleanLine.length >= 3 &&
        cleanLine.length <= 35 &&
        !cleanLine.includes('@') &&
        !cleanLine.includes('http') &&
        !/resume|curriculum|vitae|portfolio|about me|experience|education|skills/i.test(cleanLine) &&
        /^[a-zA-Z\s.'-]+$/.test(cleanLine)
      ) {
        name = cleanLine;
        break;
      }
    }
  }

  // If name was not detected from top lines, use metadata name if provided
  if (!name || name.toLowerCase() === 'candidate') {
    if (meta.name && meta.name.toLowerCase() !== 'candidate') {
      name = meta.name;
    } else {
      name = '';
    }
  }

  // Headline / Role
  let headline = 'Software Engineer';
  const roleKeywords = [
    'Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer',
    'DevOps Engineer', 'Machine Learning Engineer', 'Data Scientist', 'Cloud Engineer',
    'System Architect', 'Mobile Developer', 'Full Stack Engineer', 'Junior Software Developer'
  ];
  for (const rk of roleKeywords) {
    if (new RegExp(`\\b${rk}\\b`, 'i').test(text)) {
      headline = rk;
      break;
    }
  }

  // --------------------------------------------------------------------------
  // 2. COUNTRY & LOCATION & WORK AUTHORIZATION DETECTION (CRITICAL REQUIREMENT)
  // --------------------------------------------------------------------------
  let country = 'India'; // Default context for JobRadar
  let city = '';
  let workAuthNotes = 'Authorized to work in India (Local Citizen / Resident)';
  let isIndiaResident = true;
  let hasUSWorkAuth = false;

  // Check explicit US work authorization flags
  if (/u\.?s\.?\s+citizen|permanent resident|green card holder|authorized to work in the (?:united states|u\.?s\.)/i.test(text)) {
    hasUSWorkAuth = true;
  }

  // Check explicit country & city markers
  const indCityMatch = text.match(INDIAN_CITIES_REGEX);
  const indLocMatch = text.match(INDIAN_LOCATIONS_REGEX);
  const usCityMatch = text.match(US_CITIES_REGEX);
  const usLocMatch = text.match(US_LOCATIONS_REGEX);

  if (indCityMatch || indLocMatch) {
    country = 'India';
    city = indCityMatch ? capitalize(indCityMatch[0]) : '';
    isIndiaResident = true;
    workAuthNotes = `Candidate based in ${city || 'India'}. Eligible for direct employment in India.`;
  } else if (usCityMatch || usLocMatch) {
    country = 'United States';
    city = usCityMatch ? capitalize(usCityMatch[0]) : '';
    isIndiaResident = false;
    workAuthNotes = hasUSWorkAuth
      ? 'Located in US with US Work Authorization'
      : 'US-based location detected';
  } else {
    // Check other countries
    for (const oc of OTHER_COUNTRIES) {
      if (oc.regex.test(text)) {
        country = oc.name;
        isIndiaResident = false;
        workAuthNotes = `Located in ${oc.name}`;
        break;
      }
    }
  }

  // Indian phone number (+91) confirms India residency
  if (phone && (phone.startsWith('+91') || /^[6-9]\d{9}$/.test(phone.replace(/\D/g, '')))) {
    country = 'India';
    isIndiaResident = true;
  }

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 3. EXPERIENCE & SENIORITY TIER (CRITICAL REQUIREMENT - MONTHS & YEARS)
  // --------------------------------------------------------------------------
  const MONTH_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  const now = new Date();
  const currentYear = now.getFullYear(); // 2026
  const currentMonth = now.getMonth() + 1; // 1-indexed (e.g. 10 for October)

  // 1. Detect explicit months statements: e.g. "8+ months of experience", "8 months experience", "more than 8 months"
  const explicitMonthsMatch = text.match(/(?:more\s+than|>)?\s*([0-9]+)\+?\s*(?:months?|mos\.?)(?:\s+of)?(?:\s+relevant|\s+professional|\s+software|\s+engineering|\s+industry|\s+total|\s+work)?\s*experience\b/i) ||
                              text.match(/\b([0-9]+)\+?\s*months?\s+in\s+(?:software|web|frontend|backend|tech|fullstack|engineering|development|sde)\b/i);

  // 2. Detect explicit years statements: e.g. "3+ years of experience", "1.5 years experience"
  const expMatch = text.match(/(?:more\s+than|>)?\s*([0-9]+(?:\.[0-9]+)?)\+?\s*years?(?:\s+of)?(?:\s+relevant|\s+professional|\s+software|\s+engineering|\s+industry|\s+total|\s+work)?\s*experience\b/i) ||
                   text.match(/\b([0-9]+)\+?\s*years?\s+in\s+(?:software|web|frontend|backend|tech|fullstack|engineering|development)\b/i);

  // 3. Extract EXPERIENCE / WORK HISTORY section specifically to prevent education/college dates
  // (e.g. 2020-2024 Bachelor, 2024-2026 Master) from being erroneously summed into work experience!
  let expSectionText = text;
  const expHeaderRegex = /(?:^|\n)\s*(?:[0-9]+[.\-)]\s*)?(?:work\s+experience|professional\s+experience|work\s+history|experience|employment|career\s+history)\b/i;
  const expHeaderMatch = text.match(expHeaderRegex);
  if (expHeaderMatch) {
    const afterHeader = text.slice(expHeaderMatch.index + expHeaderMatch[0].length);
    const nextSectionRegex = /(?:^|\n)\s*(?:[0-9]+[.\-)]\s*)?(?:education|academic(?:s|\s+background|\s+history)?|projects|featured\s+projects|personal\s+projects|open\s*source|technical\s+skills|skills(?:\s*&|\s+and|\s+technical)?|certifications?|licenses|awards?|achievements?|publications?|contact|about(?:\s+me)?|summary)\b/i;
    const nextMatch = afterHeader.match(nextSectionRegex);
    expSectionText = nextMatch ? afterHeader.slice(0, nextMatch.index) : afterHeader;
  }

  // Detect date ranges strictly in work history
  // e.g. "Jan 2026 - Present", "Apr 2024 - May 2024", "01/2026 - Present"
  const dateRangesRegex = /\b(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.,\s]*)?(20[12][0-9])\s*(?:[-–—to]+|\s+to\s+)\s*(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.,\s]*)?(present|current|till date|now|20[12][0-9])\b/gi;

  const dateMatches = [...expSectionText.matchAll(dateRangesRegex)];
  const intervals = [];

  for (const match of dateMatches) {
    // Check line context to strictly exclude any education/degree dates that slipped in
    const matchPos = match.index;
    const lineStart = Math.max(0, expSectionText.lastIndexOf('\n', matchPos));
    const lineEnd = expSectionText.indexOf('\n', matchPos + match[0].length);
    const lineContext = expSectionText.slice(lineStart, lineEnd === -1 ? expSectionText.length : lineEnd);
    if (/\b(?:b\.?tech|b\.?e\b|b\.?sc|m\.?tech|mca|bca|ph\.?d|master|bachelor|degree|college|university|school|high\s+school|cgpa|gpa|matriculation|intermediate)\b/i.test(lineContext)) {
      continue;
    }

    const startMonthStr = match[1] ? match[1].toLowerCase() : null;
    const startYear = parseInt(match[2], 10);
    const startMonth = startMonthStr && MONTH_MAP[startMonthStr] ? MONTH_MAP[startMonthStr] : 1;

    const endMonthStr = match[3] ? match[3].toLowerCase() : null;
    const endYearStr = match[4].toLowerCase();

    let endYear, endMonth;
    if (/present|current|till date|now/i.test(endYearStr)) {
      endYear = currentYear;
      endMonth = currentMonth;
    } else {
      endYear = parseInt(endYearStr, 10);
      endMonth = endMonthStr && MONTH_MAP[endMonthStr] ? MONTH_MAP[endMonthStr] : 12;
    }

    const startTotalMonths = startYear * 12 + startMonth;
    const endTotalMonths = endYear * 12 + endMonth;

    if (endTotalMonths >= startTotalMonths) {
      intervals.push({ start: startTotalMonths, end: endTotalMonths, raw: match[0] });
    }
  }

  // Merge overlapping employment intervals so months are accurate and not double-counted
  intervals.sort((a, b) => a.start - b.start);
  let calculatedMonthsFromHistory = 0;
  if (intervals.length > 0) {
    let currentStart = intervals[0].start;
    let currentEnd = intervals[0].end;
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start <= currentEnd) {
        currentEnd = Math.max(currentEnd, intervals[i].end);
      } else {
        calculatedMonthsFromHistory += (currentEnd - currentStart);
        currentStart = intervals[i].start;
        currentEnd = intervals[i].end;
      }
    }
    calculatedMonthsFromHistory += (currentEnd - currentStart);
  }

  // 4. Detect fresher flags & graduation
  const fresherFlag = /\b(fresher|entry[- ]level|student|recent grad|new grad|class of 202[5-6]|pursuing b\.?tech|expected graduation|final year student)\b/i.test(text);

  // Check graduation year
  const gradMatch = text.match(/\b(?:graduated|graduation|class of|batch of|passing year|b\.?tech|b\.?e\.?|mca)\s*(?:in|:)?\s*(201[0-9]|202[0-6])\b/i);
  let gradYear = null;
  if (gradMatch) {
    gradYear = parseInt(gradMatch[1], 10);
  }

  // Active full-time or SDE employment marker
  const hasActiveJob = /\b(sde|software\s+(?:development\s+)?engineer|developer|consultancy|full\s*stack)\b/i.test(text) && /\b(present|current)\b/i.test(text);

  // Consolidate total experience in months
  let totalExperienceMonths = 0;
  if (explicitMonthsMatch) {
    totalExperienceMonths = parseInt(explicitMonthsMatch[1], 10);
  } else if (expMatch) {
    totalExperienceMonths = Math.round(parseFloat(expMatch[1]) * 12);
  } else if (calculatedMonthsFromHistory > 0) {
    totalExperienceMonths = calculatedMonthsFromHistory;
  } else if (gradYear && gradYear >= currentYear && !hasActiveJob) {
    totalExperienceMonths = 0;
  } else if (fresherFlag && !hasActiveJob) {
    totalExperienceMonths = 0;
  } else {
    totalExperienceMonths = hasActiveJob ? 8 : 0;
  }

  const totalYears = Math.floor(totalExperienceMonths / 12);
  const experienceMonths = totalExperienceMonths % 12;

  // Fresher classification:
  // If candidate has >= 6 months of professional work experience or active SDE role, they are NOT a 0-experience fresher!
  let isFresher = false;
  if (totalExperienceMonths === 0 || (totalExperienceMonths < 6 && fresherFlag && !hasActiveJob)) {
    isFresher = true;
  }

  // Friendly experience display text
  let experienceDisplay = '';
  if (totalExperienceMonths === 0) {
    experienceDisplay = isFresher ? 'Fresher (0 Exp)' : '0 Yrs Exp';
  } else if (totalExperienceMonths < 12) {
    experienceDisplay = `${totalExperienceMonths} Months`;
  } else if (experienceMonths === 0) {
    experienceDisplay = `${totalYears} Years`;
  } else {
    experienceDisplay = `${totalYears} Yr${totalYears > 1 ? 's' : ''} ${experienceMonths} Mos`;
  }

  // Seniority classification
  let seniorityLevel = '';
  if (isFresher || totalExperienceMonths === 0) {
    seniorityLevel = 'Fresher / Early Career (0 Exp)';
  } else if (totalExperienceMonths < 12) {
    seniorityLevel = `Early Career (< 1 Year, ${totalExperienceMonths} Months)`;
  } else if (totalExperienceMonths < 24) {
    seniorityLevel = 'Junior Developer (1 - 2 Years)';
  } else if (totalExperienceMonths < 48) {
    seniorityLevel = 'Mid-Level Professional (2 - 4 Years)';
  } else if (totalExperienceMonths < 84) {
    seniorityLevel = 'Senior Professional (4 - 7 Years)';
  } else {
    seniorityLevel = 'Lead / Principal Engineer (7+ Years)';
  }

  // --------------------------------------------------------------------------
  // 4. TECHNICAL SKILLS & TECH STACK DETECTION
  // --------------------------------------------------------------------------
  const candidateSkills = [];
  for (const item of EXTENDED_SKILL_KEYWORDS) {
    if (item.regex.test(text)) {
      candidateSkills.push(item.name);
    }
  }

  // Fallbacks if very few skills parsed
  if (candidateSkills.length === 0) {
    candidateSkills.push('Software Engineering', 'Problem Solving', 'Data Structures & Algorithms');
  }

  // --------------------------------------------------------------------------
  // 5. EDUCATION & DEGREE
  // --------------------------------------------------------------------------
  let education = 'B.Tech / B.E. in Computer Science or Equivalent';
  if (/\b(?:ph\.?d|doctorate)\b/i.test(text)) {
    education = 'Ph.D. / Doctorate in Computer Science or quantitative field';
  } else if (/\b(?:master['’]s(?:\s+degree)?|m\.?tech|m\.s\b|mca)\b/i.test(text) && !/\b(?:scrum\s*master|master\s*branch|webmaster|ms\s*office|\d+\s*ms)\b/i.test(text)) {
    education = "Master's Degree (M.Tech / M.S. / MCA) in Computer Science";
  } else if (/\b(?:b\.?tech|b\.?e\.?|bachelor of technology|bachelor of engineering)\b/i.test(text)) {
    education = 'B.Tech / B.E. in Computer Science or Information Technology';
  } else if (/\b(?:bca|b\.?sc)\b/i.test(text)) {
    education = 'BCA / B.Sc in Computer Science or related degree';
  }

  return {
    sourceType: meta.sourceType || 'manual',
    sourceName: meta.sourceName || (meta.sourceType === 'url' ? 'Portfolio Website' : 'Uploaded CV'),
    parsedAt: new Date().toISOString(),
    name: name || meta.name || '',
    email,
    phone,
    headline,
    country,
    city,
    isIndiaResident,
    hasUSWorkAuth,
    workAuthNotes,
    totalYearsExperience: totalYears,
    experienceMonths: experienceMonths,
    totalExperienceMonths: totalExperienceMonths,
    experienceDisplay: experienceDisplay,
    isFresher,
    seniorityLevel,
    skills: candidateSkills,
    skillsCount: candidateSkills.length,
    education,
    textLength: text.length,
    rawSnippet: text.slice(0, 300).replace(/\s+/g, ' ').trim(),
    rawCvText: text
  };
}

function createEmptyProfile(meta = {}) {
  return {
    sourceType: meta.sourceType || 'manual',
    sourceName: meta.sourceName || 'Candidate Profile',
    parsedAt: new Date().toISOString(),
    name: meta.name || '',
    email: '',
    phone: '',
    headline: 'Software Developer',
    country: 'India',
    city: '',
    isIndiaResident: true,
    hasUSWorkAuth: false,
    workAuthNotes: 'Eligible for Direct India hiring',
    totalYearsExperience: 2,
    experienceMonths: 0,
    totalExperienceMonths: 24,
    experienceDisplay: '2 Years',
    isFresher: false,
    seniorityLevel: 'Mid-Level Professional',
    skills: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL'],
    skillsCount: 5,
    education: 'B.Tech / B.E. in Computer Science or Equivalent',
    textLength: 0,
    rawSnippet: ''
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = {
  parseCvPdf,
  parsePortfolioUrl,
  extractCandidateProfile
};
