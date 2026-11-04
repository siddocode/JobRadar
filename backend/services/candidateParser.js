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
const dns = require('node:dns').promises;
const net = require('node:net');
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
  { name: 'System Design', regex: /\bsystem design|distributed systems|microservices\b/i },
  { name: 'Redux', regex: /\bredux(?: toolkit)?\b/i },
  { name: 'Zustand', regex: /\bzustand\b/i },
  { name: 'React Native', regex: /\breact native\b/i },
  { name: 'Astro', regex: /\bastro\b/i },
  { name: 'Nuxt.js', regex: /\bnuxt(?:\.js)?\b/i },
  { name: 'Bootstrap', regex: /\bbootstrap\b/i },
  { name: 'Sass / SCSS', regex: /\b(?:sass|scss)\b/i },
  { name: 'Material UI', regex: /\b(?:material ui|mui)\b/i },
  { name: 'Vite', regex: /\bvite\b/i },
  { name: 'Webpack', regex: /\bwebpack\b/i },
  { name: 'jQuery', regex: /\bjquery\b/i },
  { name: 'NestJS', regex: /\bnest(?:\.js|js)?\b/i },
  { name: 'Hono', regex: /\bhono\b/i },
  { name: 'Prisma', regex: /\bprisma\b/i },
  { name: 'Sequelize', regex: /\bsequelize\b/i },
  { name: 'TypeORM', regex: /\btypeorm\b/i },
  { name: 'Ruby on Rails', regex: /\bruby on rails|\brails\b/i },
  { name: 'Laravel', regex: /\blaravel\b/i },
  { name: 'ASP.NET', regex: /\basp\.net\b/i },
  { name: 'gRPC', regex: /\bgrpc\b/i },
  { name: 'WebSockets', regex: /\bwebsockets?\b/i },
  { name: 'SQLite', regex: /\bsqlite\b/i },
  { name: 'DynamoDB', regex: /\bdynamodb\b/i },
  { name: 'Supabase', regex: /\bsupabase\b/i },
  { name: 'Firebase', regex: /\bfirebase\b/i },
  { name: 'Elasticsearch', regex: /\belasticsearch\b/i },
  { name: 'Neo4j', regex: /\bneo4j\b/i },
  { name: 'Terraform', regex: /\bterraform\b/i },
  { name: 'Vercel', regex: /\bvercel\b/i },
  { name: 'Netlify', regex: /\bnetlify\b/i },
  { name: 'Cloudflare', regex: /\bcloudflare\b/i },
  { name: 'CircleCI', regex: /\bcircleci\b/i },
  { name: 'Prometheus', regex: /\bprometheus\b/i },
  { name: 'Grafana', regex: /\bgrafana\b/i },
  { name: 'Postman', regex: /\bpostman\b/i },
  { name: 'Figma', regex: /\bfigma\b/i },
  { name: 'Jest', regex: /\bjest\b/i },
  { name: 'Cypress', regex: /\bcypress\b/i },
  { name: 'Playwright', regex: /\bplaywright\b/i },
  { name: 'Vitest', regex: /\bvitest\b/i },
  { name: 'Storybook', regex: /\bstorybook\b/i },
  { name: 'Jira', regex: /\bjira\b/i },
  { name: 'Confluence', regex: /\bconfluence\b/i },
  { name: 'Swagger / OpenAPI', regex: /\bswagger|openapi\b/i },
  { name: 'Data Structures & Algorithms', regex: /\bdata structures?(?: and| &) algorithms?|\bdsa\b/i },
  { name: 'Object-Oriented Programming', regex: /\bobject[- ]oriented programming|\boop\b/i },
  { name: 'Agile', regex: /\bagile\b/i }
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

function htmlToReadableText(html = '') {
  const lineBreakToken = 'JOBRADAR_LINE_BREAK_TOKEN';
  return stripHtml(
    html
      .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi, lineBreakToken)
      .replace(/<\/(?:p|div|li|ul|ol|section|article|header|footer|h[1-6]|tr|td|th|dt|dd)\s*>/gi, lineBreakToken)
      .replace(/<(?:p|div|li|ul|ol|section|article|header|footer|h[1-6]|tr|td|th|dt|dd)\b[^>]*>/gi, lineBreakToken)
  ).split(lineBreakToken).map(line => line.trim()).filter(Boolean).join('\n');
}

function collectStructuredPersonFields(value, fields = {}, depth = 0) {
  if (!value || depth > 8) return fields;
  if (Array.isArray(value)) {
    value.forEach(item => collectStructuredPersonFields(item, fields, depth + 1));
    return fields;
  }
  if (typeof value !== 'object') return fields;

  for (const [key, fieldValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
    const flatValues = values.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object') return [item.name, item.value, item.addressLocality, item.addressCountry].filter(Boolean);
      return [];
    }).filter(item => typeof item === 'string' && item.trim());

    if (flatValues.length) {
      if (/^(name|givenname|familyname)$/.test(normalizedKey)) {
        const value = flatValues.join(' ').trim();
        fields.name = normalizedKey === 'familyname' && fields.name ? `${fields.name} ${value}` : (fields.name || value);
      } else if (/^(jobtitle|worksfor|description)$/.test(normalizedKey) && !fields.headline) {
        fields.headline = flatValues.join(', ');
      } else if (/^(knowsabout|skills|skill|keywords)$/.test(normalizedKey)) {
        fields.skills = [...(fields.skills || []), ...flatValues];
      } else if (/^(alumniof|hascredential|credential|education|educationalcredential)$/.test(normalizedKey)) {
        fields.education = [...(fields.education || []), ...flatValues];
      } else if (/^(email)$/.test(normalizedKey)) {
        fields.email = fields.email || flatValues[0];
      } else if (/^(addresslocality|addresscountry|location)$/.test(normalizedKey)) {
        fields.location = [...(fields.location || []), ...flatValues];
      }
    }
    collectStructuredPersonFields(fieldValue, fields, depth + 1);
  }
  return fields;
}

function extractSkillSection(html, visibleText) {
  const chunks = [];
  const sectionBlocks = html.match(/<(?:section|article|div)\b[^>]*(?:id|class|aria-label)=["'][^"']*(?:skill|technology|tech-stack|expertise)[^"']*["'][^>]*>[\s\S]*?<\/(?:section|article|div)>/gi) || [];
  for (const block of sectionBlocks) chunks.push(htmlToReadableText(block));

  const headingBlocks = html.match(/<h[1-6]\b[^>]*>\s*[^<]*(?:skills?|technologies|tech stack|expertise)[^<]*<\/h[1-6]>[\s\S]*?(?=<h[1-6]\b|$)/gi) || [];
  for (const block of headingBlocks) chunks.push(htmlToReadableText(block));

  const markedItems = [];
  const markedItemRegex = /<(span|li|a|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(markedItemRegex)) {
    if (!/(?:skill|technology|tech-stack|expertise|badge|tag)/i.test(match[2])) continue;
    const label = match[2].match(/(?:data-skill|aria-label|title)=["']([^"']+)["']/i)?.[1];
    const content = htmlToReadableText(match[3]);
    const value = label || content;
    if (value && value.length <= 50) markedItems.push(value);
  }
  for (const match of html.matchAll(/\bdata-skill=["']([^"']+)["']/gi)) markedItems.push(match[1]);
  if (markedItems.length) chunks.push(markedItems.join('\n'));

  const sectionMatch = visibleText.match(/(?:^|\n)\s*(?:technical\s+skills|skills|technologies|tech stack|tools(?:\s*&\s*technologies)?|areas of expertise)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:experience|work history|education|projects|certifications|contact|about|summary|interests)\b|$)/i);
  if (sectionMatch) chunks.push(sectionMatch[1]);
  return chunks.filter(Boolean).join('\n');
}

function extractExplicitSkillNames(text) {
  const candidates = [];
  const directMatches = text.matchAll(/(?:^|\n)\s*(?:portfolio\s+)?(?:technical\s+)?(?:skills|technologies|tech stack)\s*:\s*([^\n]+)/gi);
  for (const match of directMatches) candidates.push(...match[1].split(/[,;|•·\n]+/));

  const portfolioSection = text.match(/(?:^|\n)\s*Portfolio Skills\s*:\s*\n([\s\S]*?)(?=\n\s*(?:Title|Summary|Data|Structured Data|Experience|Education|Projects|Contact)\s*[:\n]|$)/i);
  if (portfolioSection) candidates.push(...portfolioSection[1].split(/[,;|•·\n]+/));

  const resumeSection = text.match(/(?:^|\n)\s*(?:technical\s+skills|skills|technologies|tech stack)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:experience|work history|education|projects|certifications|awards|publications|summary|contact|interests)\b|$)/i);
  if (resumeSection) candidates.push(...resumeSection[1].split(/[,;|•·\n]+/));

  const seen = new Set();
  return candidates.map(skill => skill.replace(/^[\s\-–—*•]+|[\s\-–—*•]+$/g, '').trim())
    .filter(skill => skill.length >= 2 && skill.length <= 50 && !/^(skills?|technical skills|technologies|tech stack|tools|expertise)$/i.test(skill))
    .filter(skill => {
      const key = skill.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') ||
      normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('ff') || normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.');
  }
  return true;
}

async function isPublicWebUrl(value) {
  try {
    const target = new URL(value);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
      target.hostname === 'localhost' || target.hostname.endsWith('.local')) return false;
    if (net.isIP(target.hostname)) return !isPrivateAddress(target.hostname);
    const addresses = await dns.lookup(target.hostname, { all: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch (_) {
    return false;
  }
}

function serializePortfolioApiData(value, depth = 0) {
  if (depth > 7 || value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(item => serializePortfolioApiData(item, depth + 1)).filter(Boolean).join('\n');
  if (typeof value !== 'object') return '';
  const lines = [];
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|hash|svg|icon|base64/i.test(key) || item == null) continue;
    const label = /^(fullName|givenName)$/i.test(key) ? 'Candidate Name' :
      /^(headline|title|jobTitle|professionalTitle)$/i.test(key) ? 'Headline' :
        key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    const content = serializePortfolioApiData(item, depth + 1);
    if (content) lines.push(`${label}: ${content}`);
  }
  return lines.join('\n');
}

async function extractPublicPortfolioApiData(html, pageUrl) {
  const page = new URL(pageUrl);
  const scriptUrls = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => { try { return new URL(match[1], page).href; } catch (_) { return ''; } })
    .filter((value, index, all) => value && new URL(value).origin === page.origin && all.indexOf(value) === index)
    .slice(0, 5);
  const bundles = await Promise.all(scriptUrls.map(async scriptUrl => {
    try {
      const response = await fetch(scriptUrl, { signal: AbortSignal.timeout(7000), redirect: 'error', headers: { Accept: 'application/javascript,text/javascript,*/*' } });
      if (!response.ok) return '';
      return (await response.text()).slice(0, 2_000_000);
    } catch (_) { return ''; }
  }));

  const endpointMap = new Map();
  for (const bundle of bundles) {
    const bases = [...bundle.matchAll(/(?:const|let|var)\s+[\w$]+\s*=\s*["'](https?:\/\/[^"']+)["'](?:\.replace\([^)]*\))?/g)]
      .map(match => match[1].replace(/\/+$/, ''));
    const prefixes = [...bundle.matchAll(/(?:const|let|var)\s+[\w$]+\s*=\s*["'](\/[^"']*)["']/g)]
      .map(match => match[1]).filter(path => /api/i.test(path));
    const routes = [...bundle.matchAll(/(?:get|fetch|load)(Profile|About|Site|Skills?|Experience|Education|Projects?|Timeline|Achievements?|Resume|Stats)\s*:\s*(?:\([^)]*\)|[\w$]+)\s*=>\s*[\w$]+\(\s*["'](\/[^"']+)["']/gi)];
    for (const route of routes) {
      const routePath = route[2];
      const prefix = prefixes.find(item => routePath === item || routePath.startsWith(`${item}/`)) || '';
      const endpoint = routePath.startsWith('/') ? routePath : `/${routePath}`;
      const base = bases[0] || page.origin;
      const apiUrl = new URL(prefix && !endpoint.startsWith(`${prefix}/`) && endpoint !== prefix ? `${prefix}${endpoint}` : endpoint, base).href;
      endpointMap.set(apiUrl, route[1]);
    }
  }

  const endpoints = [...endpointMap.entries()].slice(0, 12);
  const responses = await Promise.all(endpoints.map(async ([apiUrl, label]) => {
    if (!await isPublicWebUrl(apiUrl)) return '';
    try {
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(7000), redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) return '';
      const raw = await response.text();
      if (raw.length > 1_000_000) return '';
      const data = JSON.parse(raw);
      if (/skills?/i.test(label)) {
        const skills = [];
        const collectSkills = (item, depth = 0) => {
          if (depth > 6 || item == null) return;
          if (typeof item === 'string' || typeof item === 'number') { skills.push(String(item)); return; }
          if (Array.isArray(item)) { item.forEach(child => collectSkills(child, depth + 1)); return; }
          if (typeof item === 'object') {
            if (item.visible === false || item.published === false || item.isPublished === false) return;
            const skill = item.name || item.skill || item.technology || item.label;
            if (typeof skill === 'string') skills.push(skill);
            else Object.values(item).forEach(child => collectSkills(child, depth + 1));
          }
        };
        collectSkills(data);
        const uniqueSkills = [...new Set(skills.map(skill => skill.trim()).filter(Boolean))];
        return uniqueSkills.length ? `Technical Skills:\n${uniqueSkills.join('\n')}` : '';
      }
      const serialized = serializePortfolioApiData(data);
      return serialized ? `${label}:\n${serialized}` : '';
    } catch (_) { return ''; }
  }));
  return responses.filter(Boolean).join('\n\n');
}

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
    return `${candidateName ? `Candidate Name: ${candidateName}\n` : ''}Profile: ${formattedUrl}\nNote: Parsed from LinkedIn profile URL.`;
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
    const publicApiText = await extractPublicPortfolioApiData(html, response.url || formattedUrl);
    if (publicApiText) textParts.push(publicApiText);

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      textParts.push(`Title: ${titleMatch[1].trim()}`);
    }

    const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match?.[1]) {
      const heading = htmlToReadableText(h1Match[1]);
      const introName = heading.match(/(?:(?:hi|hello|hey)[,!]?\s*)?(?:i am|i['’]m|this is)\s+([A-ZÀ-Ý][\p{L}.'-]*(?:\s+[A-ZÀ-Ý][\p{L}.'-]*){0,3})/iu);
      const headingName = introName?.[1] || heading.split(/\s+(?:[-–—|,]|\b(?:software|frontend|front-end|backend|back-end|full.?stack|developer|engineer|designer|student|building|creating|portfolio)\b)/i)[0].trim();
      if (headingName.length >= 2 && headingName.length <= 50 && !/^(?:software|full.?stack|frontend|backend|developer|engineer|designer|welcome|portfolio|home|hello|hey|good morning|good afternoon|hey there|i build|i create|i craft)\b/i.test(headingName)) {
        textParts.push(`Candidate Name: ${headingName}`);
      }
    }

    const firstNameMatch = html.match(/<meta\b[^>]*(?:name|property)=["']profile:first_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    const lastNameMatch = html.match(/<meta\b[^>]*(?:name|property)=["']profile:last_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    const authorMatch = html.match(/<meta\b[^>]*(?:name|property)=["'](?:author|og:title)["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
      html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:author|profile:first_name|og:title)["'][^>]*>/i);
    if (firstNameMatch?.[1]) textParts.push(`Candidate Name: ${firstNameMatch[1].trim()}${lastNameMatch?.[1] ? ` ${lastNameMatch[1].trim()}` : ''}`);
    else if (authorMatch?.[1]) textParts.push(`Candidate Name: ${authorMatch[1].trim()}`);

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
          textParts.push(`Data: ${extractedJsonText.slice(0, 20000)}`);
        }
      } catch (_) {}
    }

    // Extract JSON-LD (Person / ProfilePage schemas)
    const ldJsonMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldJsonMatches) {
      try {
        const ldData = JSON.parse(m[1]);
        const personFields = collectStructuredPersonFields(ldData);
        if (personFields.name) textParts.push(`Candidate Name: ${personFields.name}`);
        if (personFields.headline) textParts.push(`Headline: ${personFields.headline}`);
        if (personFields.email) textParts.push(`Email: ${personFields.email}`);
        if (personFields.location?.length) textParts.push(`Location: ${personFields.location.join(', ')}`);
        if (personFields.education?.length) textParts.push(`Education: ${personFields.education.join(', ')}`);
        if (personFields.skills?.length) textParts.push(`Skills: ${personFields.skills.join(', ')}`);
        const ldText = extractStringsFromJson(ldData);
        if (ldText) {
          textParts.push(`Structured Data: ${ldText.slice(0, 2000)}`);
        }
      } catch (_) {}
    }

    // Extract visible body content
    const cleanBodyText = htmlToReadableText(html);
    if (cleanBodyText) {
      textParts.push(cleanBodyText);
      const skillText = extractSkillSection(html, cleanBodyText);
      if (skillText) textParts.push(`Portfolio Skills:\n${skillText}`);
    }

    const combined = textParts.join('\n\n').trim();

    // Fallback: If minimal text extracted, construct a basic portfolio context using hostname and title
    if (!combined || combined.length < 30) {
      return `Portfolio Website: ${formattedUrl}`;
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
  const explicitNameMatch = text.match(/(?:Candidate Name|Full Name|Name|Author):\s*([^\r\n|;,]+)/i);
  if (explicitNameMatch) {
    const candidateName = explicitNameMatch[1].trim()
      .replace(/^(?:portfolio|resume|profile)\s+(?:of|for)\s+/i, '')
      .replace(/\s*(?:[-–—|:]\s*)(?:portfolio|developer|engineer|software|full\s*stack|homepage|official|home).*$/i, '')
      .replace(/\s+(?:portfolio|website)$/i, '')
      .trim();
    if (candidateName.length >= 2 && candidateName.length <= 50 && /^[a-zA-ZÀ-ÿ\s.'-]+$/.test(candidateName)) name = candidateName;
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
  const explicitHeadline = text.match(/(?:^|\n)\s*Headline:\s*([^\r\n]+)/i);
  let headline = explicitHeadline?.[1]?.trim() || '';
  const roleKeywords = [
    'Full-Stack Developer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer',
    'Junior Web Developer', 'DevOps Engineer', 'Machine Learning Engineer', 'Data Scientist', 'Cloud Engineer',
    'System Architect', 'Mobile Developer', 'Full Stack Engineer', 'Junior Software Developer'
  ];
  if (!headline) {
    for (const rk of roleKeywords) {
      if (new RegExp(`\\b${rk}\\b`, 'i').test(text)) {
        headline = rk;
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. COUNTRY & LOCATION & WORK AUTHORIZATION DETECTION (CRITICAL REQUIREMENT)
  // --------------------------------------------------------------------------
  let country = 'Unspecified';
  let city = '';
  let workAuthNotes = 'Location and work authorization not detected';
  let isIndiaResident = false;
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
    totalExperienceMonths = 0;
  }

  const totalYears = Math.floor(totalExperienceMonths / 12);
  const experienceMonths = totalExperienceMonths % 12;

  // Fresher classification:
  // If candidate has >= 6 months of professional work experience or active SDE role, they are NOT a 0-experience fresher!
  let isFresher = false;
  if (fresherFlag && (totalExperienceMonths === 0 || (totalExperienceMonths < 6 && !hasActiveJob))) {
    isFresher = true;
  }

  // Friendly experience display text
  let experienceDisplay = '';
  if (totalExperienceMonths === 0) {
    experienceDisplay = isFresher ? 'Fresher (0 Exp)' : 'Not detected';
  } else if (totalExperienceMonths < 12) {
    experienceDisplay = `${totalExperienceMonths} Months`;
  } else if (experienceMonths === 0) {
    experienceDisplay = `${totalYears} Years`;
  } else {
    experienceDisplay = `${totalYears} Yr${totalYears > 1 ? 's' : ''} ${experienceMonths} Mos`;
  }

  // Seniority classification
  let seniorityLevel = '';
  if (isFresher) {
    seniorityLevel = 'Fresher / Early Career (0 Exp)';
  } else if (totalExperienceMonths === 0) {
    seniorityLevel = 'Not detected';
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
  const candidateSkills = extractExplicitSkillNames(text);
  const knownSkillKeys = new Set(candidateSkills.map(skill => skill.toLowerCase().replace(/[^a-z0-9]/g, '')));
  for (const item of EXTENDED_SKILL_KEYWORDS) {
    const normalized = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (item.regex.test(text) && !knownSkillKeys.has(normalized)) {
      candidateSkills.push(item.name);
      knownSkillKeys.add(normalized);
    }
  }

  // --------------------------------------------------------------------------
  // 5. EDUCATION & DEGREE
  // --------------------------------------------------------------------------
  const educationText = (text.match(/(?:^|\n)\s*(?:education|academic background|academic qualifications|qualifications)\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:experience|employment|projects|skills|certifications|awards|publications|summary|contact)\b|$)/i) || [])[1] || text;
  let education = '';
  if (/\b(?:ph\.?d|doctorate)\b/i.test(educationText)) {
    education = 'Ph.D. / Doctorate in Computer Science or quantitative field';
  } else if (/\b(?:master['’]s(?:\s+degree)?|m\.?tech|m\.s\b|mca)\b/i.test(text) && !/\b(?:scrum\s*master|master\s*branch|webmaster|ms\s*office|\d+\s*ms)\b/i.test(text)) {
    education = "Master's Degree (M.Tech / M.S. / MCA) in Computer Science";
  } else if (/\b(?:b\.?tech|b\.?e\.?|bachelor of technology|bachelor of engineering)\b/i.test(educationText)) {
    education = 'B.Tech / B.E. in Computer Science or Information Technology';
  } else if (/\b(?:bca|b\.?sc)\b/i.test(educationText)) {
    education = 'BCA / B.Sc in Computer Science or related degree';
  }

  if (/\b(?:master|m\.?tech|m\.?s\b|mca|mba)\b/i.test(educationText) && !/\b(?:scrum\s*master|master\s*branch|webmaster|ms\s*office)\b/i.test(educationText)) {
    education = "Master's Degree (M.Tech / M.S. / MCA) in Computer Science";
  }

  if (education || (/\b(?:mba|master|m\.?tech|mca)\b/i.test(educationText) && !/\b(?:scrum\s*master|master\s*branch|webmaster|ms\s*office)\b/i.test(educationText))) {
    const highestDegreePatterns = [
      /ph\.?d|doctorate/i,
      /master|m\.?tech|m\.?s(?:c|c\.)?\b|mca|mba|m\.?eng|m\.?phil|m\.?com|m\.?a\b/i,
      /b\.?tech|b\.?e\.?|bachelor|bca|b\.?sc|b\.?com|bba|b\.?a\b|b\.?eng|b\.?s\b/i,
      /diploma/i
    ];
    for (const degreePattern of highestDegreePatterns) {
      const degreeLineMatch = educationText.split(/\r?\n/).find((line) => degreePattern.test(line));
      if (degreeLineMatch) {
        education = degreeLineMatch.trim().slice(0, 180);
        break;
      }
    }
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
    headline: '',
    country: 'Unspecified',
    city: '',
    isIndiaResident: false,
    hasUSWorkAuth: false,
    workAuthNotes: 'Location and work authorization not detected',
    totalYearsExperience: 0,
    experienceMonths: 0,
    totalExperienceMonths: 0,
    experienceDisplay: 'Not detected',
    isFresher: false,
    seniorityLevel: 'Not detected',
    skills: [],
    skillsCount: 0,
    education: '',
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
