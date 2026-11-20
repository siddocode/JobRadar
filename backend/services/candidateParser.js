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
const { isPrivateAddress, isPublicWebUrl } = require('../utils/ssrfGuard');
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

const INDIAN_CITIES_REGEX = /\b(bengaluru|bangalore|hyderabad|noida|greater noida|gurgaon|gurugram|delhi|new delhi|ncr|pune|mumbai|navi mumbai|thane|chennai|kolkata|howrah|durgapur|siliguri|ahmedabad|surat|vadodara|rajkot|kochi|ernakulam|indore|bhopal|chandigarh|mohali|panchkula|jaipur|jodhpur|udaipur|kota|trivandrum|thiruvananthapuram|coimbatore|madurai|trichy|salem|ballia|varanasi|lucknow|kanpur|prayagraj|allahabad|agra|meerut|ghaziabad|faridabad|patna|gaya|muzaffarpur|ranchi|jamshedpur|dhanbad|bhubaneswar|cuttack|rourkela|guwahati|nagpur|nashik|aurangabad|visakhapatnam|vijayawada|guntur|tirupati|mysuru|mysore|mangalore|mangaluru|hubli|ludhiana|amritsar|jalandhar|raipur|bilaspur|dehradun|haridwar|shimla|jammu|srinagar|goa|panaji)\b/i;
const INDIAN_LOCATIONS_REGEX = /\b(india|karnataka|telangana|maharashtra|tamil nadu|uttar pradesh|west bengal|bihar|jharkhand|rajasthan|madhya pradesh|odisha|orissa|punjab|assam|chhattisgarh|uttarakhand|himachal pradesh|haryana|kerala|gujarat|andhra pradesh|goa|tripura|manipur)\b/i;

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
  return html
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi, lineBreakToken)
    .replace(/<\/(?:p|div|li|ul|ol|section|article|header|footer|h[1-6]|tr|td|th|dt|dd)\s*>/gi, lineBreakToken)
    .replace(/<(?:p|div|li|ul|ol|section|article|header|footer|h[1-6]|tr|td|th|dt|dd)\b[^>]*>/gi, lineBreakToken)
    .replace(/<\/?[a-zA-Z!][a-zA-Z0-9:-]*(?:\s[^>]*)?>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#0*39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r]+/g, ' ')
    .split(lineBreakToken)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
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
      } else if (/^(sameas|url)$/.test(normalizedKey)) {
        fields.links = [...(fields.links || []), ...flatValues];
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
    .filter(skill => {
      if (skill.length < 2 || skill.length > 40) return false;
      if (/^(skills?|technical skills|technologies|tech stack|tools|expertise)$/i.test(skill)) return false;
      if (/^(?:0\s*)?\d+(?:\s*\d+)?$/.test(skill)) return false;
      if (/^all\s+(?:languages|frontend|backend|devops|tools)/i.test(skill)) return false;
      if (/\b(?:languages|frontend|backend|devops|tools|database)\b/i.test(skill) && /\b(?:&|and)\b/i.test(skill) && skill.length > 20) return false;
      if (/^(?:code|live|demo|view|download|terminal|theme|present|loading|skills?)\b/i.test(skill)) return false;
      return true;
    })
    .filter(skill => {
      const key = skill.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

function safeResolveUrl(candidate, base) {
  try {
    return new URL(candidate, base).href;
  } catch (_) {
    return '';
  }
}

async function safePublicFetch(urlString, options = {}, maxRedirects = 5) {
  let currentUrl = urlString;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const allowed = await isPublicWebUrl(currentUrl);
    if (!allowed) {
      throw new Error('Blocked access to non-public or internal network URL.');
    }
    const response = await fetch(currentUrl, {
      ...options,
      redirect: 'manual'
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      const nextUrl = safeResolveUrl(location, currentUrl);
      if (!nextUrl) throw new Error('Invalid redirect target.');
      currentUrl = nextUrl;
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects while fetching portfolio URL.');
}

async function extractPublicPortfolioApiData(html, pageUrl) {
  const page = new URL(pageUrl);
  const scriptUrls = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)
  ]
    .map(match => safeResolveUrl(match[1], page))
    .filter((value, index, all) => value && new URL(value).origin === page.origin && all.indexOf(value) === index)
    .slice(0, 10);

  const bundles = await Promise.all(scriptUrls.map(async scriptUrl => {
    try {
      const response = await safePublicFetch(scriptUrl, {
        signal: AbortSignal.timeout(7000),
        headers: { Accept: 'application/javascript,text/javascript,*/*' }
      });
      if (!response.ok) return '';
      return (await response.text()).slice(0, 2_000_000);
    } catch (_) { return ''; }
  }));

  const endpointMap = new Map();
  for (const bundle of bundles) {
    const bases = [...bundle.matchAll(/(?:const|let|var)\s+[\w$]+\s*=\s*["'](https?:\/\/[^"']+)["'](?:\.replace\([^)]*\))?/g)]
      .map(match => match[1].replace(/\/+$/, ''));
    const prefixes = [...bundle.matchAll(/(?:const|let|var)\s+[\w$]+\s*=\s*["'](\/[^"']*)["']/g)]
      .map(match => match[1]).filter(path => /api|data/i.test(path));
    const routes = [...bundle.matchAll(/(?:get|fetch|load)(Profile|About|Site|Skills?|Experience|Education|Projects?|Timeline|Achievements?|Resume|Stats)\s*:\s*(?:\([^)]*\)|[\w$]+)\s*=>\s*[\w$]+\(\s*["'](\/[^"']+)["']/gi)];
    for (const route of routes) {
      const routePath = route[2];
      const prefix = prefixes.find(item => routePath === item || routePath.startsWith(`${item}/`)) || '';
      const endpoint = routePath.startsWith('/') ? routePath : `/${routePath}`;
      const base = bases[0] || page.origin;
      const apiUrl = new URL(prefix && !endpoint.startsWith(`${prefix}/`) && endpoint !== prefix ? `${prefix}${endpoint}` : endpoint, base).href;
      endpointMap.set(apiUrl, route[1]);
    }
    // Also catch direct fetch("/api/...") or static "/data/*.json" references (skipping widget/calendar telemetry)
    const directEndpoints = [...bundle.matchAll(/["'](\/(?:api|data)\/[a-z0-9/_-]{2,60}(?:\.json)?)["']/gi)];
    for (const m of directEndpoints) {
      if (/calendar|contributions?|analytics|telemetry|visitor|views|og-image|sitemap/i.test(m[1])) continue;
      const apiUrl = safeResolveUrl(m[1], bases[0] || page.origin);
      if (apiUrl && !endpointMap.has(apiUrl)) {
        endpointMap.set(apiUrl, m[1].split('/').pop().replace(/\.json$/i, '') || 'Data');
      }
    }
  }

  const endpoints = [...endpointMap.entries()].slice(0, 12);
  const responses = await Promise.all(endpoints.map(async ([apiUrl, label]) => {
    if (!await isPublicWebUrl(apiUrl)) return '';
    try {
      const response = await safePublicFetch(apiUrl, {
        signal: AbortSignal.timeout(7000),
        headers: { Accept: 'application/json' }
      });
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
/**
 * Extract contact emails, phone numbers, social links, and linked Resume PDF URLs
 * directly from HTML anchor tags and metadata before stripping tags.
 */
function extractHtmlSignals(html = '', baseUrl = '') {
  const emails = new Set();
  const phones = new Set();
  const socialLinks = [];
  const seenUrls = new Set();
  let resumePdfUrl = '';

  const anchorRegex = /<a\b([^>]*\bhref=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const attrs = match[1] || '';
    const rawHref = (match[2] || '').trim();
    const linkText = htmlToReadableText(match[3] || '');
    const ariaLabel = attrs.match(/(?:aria-label|title)=["']([^"']+)["']/i)?.[1] || '';
    const labelText = `${linkText} ${ariaLabel}`.trim();

    if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) continue;

    if (/^mailto:/i.test(rawHref)) {
      const addr = rawHref.replace(/^mailto:/i, '').split('?')[0].trim();
      if (addr && addr.includes('@')) emails.add(addr.toLowerCase());
      continue;
    }

    if (/^tel:/i.test(rawHref)) {
      const num = rawHref.replace(/^tel:/i, '').trim();
      if (num) phones.add(num);
      continue;
    }

    const resolved = safeResolveUrl(rawHref, baseUrl);
    if (!resolved || seenUrls.has(resolved)) continue;
    seenUrls.add(resolved);

    if (/github\.com\/[a-zA-Z0-9_-]+/i.test(resolved)) {
      socialLinks.push(`GitHub Profile: ${resolved}`);
    } else if (/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i.test(resolved)) {
      socialLinks.push(`LinkedIn Profile: ${resolved}`);
    } else if (/(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/i.test(resolved)) {
      socialLinks.push(`Twitter Profile: ${resolved}`);
    } else if (/leetcode\.com\/(?:u\/)?[a-zA-Z0-9_-]+/i.test(resolved)) {
      socialLinks.push(`LeetCode Profile: ${resolved}`);
    }

    if (
      !resumePdfUrl &&
      (/\.pdf(?:\?|#|$)/i.test(resolved) || /\b(?:resume|cv|curriculum vitae|download cv|view resume)\b/i.test(labelText)) &&
      !/privacy|terms|policy|cookie/i.test(resolved + ' ' + labelText)
    ) {
      if (/\.pdf(?:\?|#|$)/i.test(resolved) || /\b(?:resume|cv)\b/i.test(resolved)) {
        resumePdfUrl = resolved;
      }
    }
  }

  return {
    emails: [...emails],
    phones: [...phones],
    socialLinks,
    resumePdfUrl
  };
}

/**
 * Extract readable text strings embedded in Next.js App Router (self.__next_f.push) payloads.
 */
function extractNextFlightText(html = '') {
  const chunks = [];
  const flightRegex = /self\.__next_f\.push\(\[\s*\d+\s*,\s*"([\s\S]*?)"\s*\]\)/g;
  for (const m of html.matchAll(flightRegex)) {
    try {
      const decoded = JSON.parse(`"${m[1]}"`);
      const textTokens = decoded.match(/"(?:children|text|title|name|role|company|description|subtitle|headline|location|degree|institution|school|duration|period|summary)"\s*:\s*"([^"\\]{2,400})"/gi) || [];
      for (const tok of textTokens) {
        const valMatch = tok.match(/:\s*"([^"]+)"$/);
        if (valMatch?.[1] && !valMatch[1].startsWith('$') && !valMatch[1].startsWith('/_next')) {
          chunks.push(valMatch[1]);
        }
      }
    } catch (_) {}
  }
  return chunks.join('\n');
}

/**
 * Render client-side React/Vite/Next SPA portfolio pages using headless Chromium when
 * static HTML contains minimal text (fallback with full SSRF validation).
 */
async function renderPortfolioWithBrowser(targetUrl) {
  let browser = null;
  try {
    if (!await isPublicWebUrl(targetUrl)) return null;
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }
    });
    const page = await context.newPage();
    const apiChunks = [];

    await page.route('**/*', async (route) => {
      const req = route.request();
      const reqUrl = req.url();
      const resType = req.resourceType();
      if (resType === 'image' || resType === 'media' || resType === 'font') {
        return route.abort();
      }
      if (/^https?:\/\//i.test(reqUrl)) {
        try {
          const parsedReq = new URL(reqUrl);
          const host = parsedReq.hostname.toLowerCase();
          if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '::1' ||
            host.startsWith('10.') ||
            host.startsWith('192.168.') ||
            host.startsWith('169.254.') ||
            host.endsWith('.local') ||
            host.endsWith('.internal')
          ) {
            return route.abort();
          }
        } catch (_) {
          return route.abort();
        }
      }
      return route.continue();
    });

    page.on('response', async (resp) => {
      try {
        const ct = (resp.headers()['content-type'] || '').toLowerCase();
        if (resp.ok() && ct.includes('application/json') && apiChunks.length < 10) {
          const txt = await resp.text();
          if (txt && txt.length < 300_000) {
            const data = JSON.parse(txt);
            const serialized = serializePortfolioApiData(data);
            if (serialized && serialized.length > 20) {
              apiChunks.push(serialized);
            }
          }
        }
      } catch (_) {}
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      try { window.scrollTo(0, document.body.scrollHeight); } catch (_) {}
    }).catch(() => {});
    await page.waitForTimeout(400);

    const domData = await page.evaluate(() => {
      const title = document.title || '';
      const h1 = document.querySelector('h1')?.innerText?.trim() || '';
      const bodyText = document.body?.innerText || '';
      const anchors = Array.from(document.querySelectorAll('a[href]')).map(a => ({
        href: a.href || '',
        text: (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '').trim()
      })).slice(0, 120);
      return { title, h1, bodyText, anchors };
    });

    const parts = [];
    if (domData.title) parts.push(`Title: ${domData.title}`);
    if (domData.h1) parts.push(`Hero Heading: ${domData.h1}`);

    let resumePdfUrl = '';
    for (const a of domData.anchors || []) {
      if (!a.href) continue;
      if (/^mailto:/i.test(a.href)) {
        parts.push(`Email: ${a.href.replace(/^mailto:/i, '').split('?')[0].trim()}`);
      } else if (/^tel:/i.test(a.href)) {
        parts.push(`Phone: ${a.href.replace(/^tel:/i, '').trim()}`);
      } else if (/github\.com\/|linkedin\.com\/in\/|(?:twitter|x)\.com\/|leetcode\.com\//i.test(a.href)) {
        parts.push(`Links: ${a.href}`);
      } else if (!resumePdfUrl && (/\.pdf(?:\?|#|$)/i.test(a.href) || (/\b(?:resume|cv)\b/i.test(a.text) && /\.pdf/i.test(a.href)))) {
        resumePdfUrl = a.href;
      }
    }

    if (apiChunks.length) parts.push(apiChunks.join('\n\n'));
    if (domData.bodyText) parts.push(domData.bodyText);

    return {
      text: parts.join('\n\n').trim(),
      resumePdfUrl
    };
  } catch (err) {
    console.warn('[candidateParser:renderPortfolioWithBrowser] Playwright fallback skipped:', err.message);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Fetch and extract text from a Portfolio or personal website URL.
 * Supports:
 * - HTML Websites & SPAs (React, Next.js, Vue, Webflow, Framer — with Playwright fallback)
 * - Direct PDF URLs & linked Resume PDFs on portfolio sites
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

  // Full SSRF protection via DNS resolution & private subnet check
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!await isPublicWebUrl(formattedUrl)) {
    throw new Error('Local, private, or internal network URLs are not supported.');
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
        let blogUrl = '';
        try {
          const ghRes = await fetch(`https://api.github.com/users/${ghUsername}`, {
            headers: { 'User-Agent': 'JobRadar-ProfileScraper/1.0', 'Accept': 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(6000)
          });
          if (ghRes.ok) {
            const uData = await ghRes.json();
            if (uData.name) ghProfileText += `Candidate Name: ${uData.name}\n`;
            if (uData.email) ghProfileText += `Email: ${uData.email}\n`;
            if (uData.bio) ghProfileText += `Headline: ${uData.bio}\n`;
            if (uData.company) ghProfileText += `Company: ${uData.company}\n`;
            if (uData.location) ghProfileText += `Location: ${uData.location}\n`;
            if (uData.blog) {
              blogUrl = /^https?:\/\//i.test(uData.blog) ? uData.blog : `https://${uData.blog}`;
              ghProfileText += `Portfolio: ${blogUrl}\n`;
            }
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
          const reposRes = await fetch(`https://api.github.com/users/${ghUsername}/repos?sort=updated&per_page=8`, {
            headers: { 'User-Agent': 'JobRadar-ProfileScraper/1.0', 'Accept': 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(5000)
          });
          if (reposRes.ok) {
            const repos = await reposRes.json();
            if (Array.isArray(repos) && repos.length > 0) {
              const repoSummaries = repos
                .filter(r => !r.fork)
                .slice(0, 6)
                .map(r => `${r.name} | ${r.description || 'Software Project'} | ${[r.language, ...(Array.isArray(r.topics) ? r.topics : [])].filter(Boolean).join(', ')}`)
                .join('\n');
              if (repoSummaries) {
                ghProfileText += `\nProjects\n${repoSummaries}\n`;
              }
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
    let response = await safePublicFetch(formattedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      // If static fetch gets blocked (403/503), attempt browser rendering before failing
      if (response.status === 403 || response.status === 503) {
        const rendered = await renderPortfolioWithBrowser(formattedUrl);
        if (rendered?.text && rendered.text.length > 80) {
          return rendered.text;
        }
      }
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

    const finalUrl = response.url || formattedUrl;
    const html = await response.text();
    let textParts = [`Portfolio Website: ${finalUrl}`];

    // Extract anchor links (mailto:, tel:, GitHub, LinkedIn, linked Resume PDF) before stripping HTML
    const htmlSignals = extractHtmlSignals(html, finalUrl);
    for (const email of htmlSignals.emails) textParts.push(`Email: ${email}`);
    for (const phone of htmlSignals.phones) textParts.push(`Phone: ${phone}`);
    if (htmlSignals.socialLinks.length) textParts.push(htmlSignals.socialLinks.join('\n'));

    const publicApiText = await extractPublicPortfolioApiData(html, finalUrl);
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

    // Extract Next.js / Nuxt / SPA inline data (__NEXT_DATA__ and App Router __next_f)
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
    const nextFlightText = extractNextFlightText(html);
    if (nextFlightText) {
      textParts.push(nextFlightText.slice(0, 15000));
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
        if (personFields.links?.length) textParts.push(`Links: ${personFields.links.join(' ')}`);
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

    let linkedPdfUrl = htmlSignals.resumePdfUrl;
    const isSpaShell = /<div\s+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html) ||
      cleanBodyText.length < 500;

    // Fallback to headless Chromium rendering for client-side React/Vite/Next SPAs with sparse SSR content
    if (isSpaShell && !publicApiText) {
      const rendered = await renderPortfolioWithBrowser(finalUrl);
      if (rendered?.text && rendered.text.length > cleanBodyText.length + 100) {
        textParts.push(rendered.text);
      }
      if (!linkedPdfUrl && rendered?.resumePdfUrl) {
        linkedPdfUrl = rendered.resumePdfUrl;
      }
    }

    let combined = textParts.join('\n\n').trim();

    // Enrich from a linked Resume PDF on the portfolio site if present and main page lacks depth
    if (linkedPdfUrl && await isPublicWebUrl(linkedPdfUrl)) {
      const needsEnrichment = combined.length < 1500 || !/\bexperience\b/i.test(combined) || !/\beducation\b/i.test(combined);
      if (needsEnrichment) {
        try {
          const pdfResp = await safePublicFetch(linkedPdfUrl, { signal: AbortSignal.timeout(10000) });
          const pdfCt = (pdfResp.headers.get('content-type') || '').toLowerCase();
          if (pdfResp.ok && (pdfCt.includes('pdf') || /\.pdf(?:\?|#|$)/i.test(linkedPdfUrl))) {
            const len = Number(pdfResp.headers.get('content-length') || 0);
            if (!len || len <= 5 * 1024 * 1024) {
              const pdfBuf = Buffer.from(await pdfResp.arrayBuffer());
              if (pdfBuf.length <= 5 * 1024 * 1024) {
                const pdfText = await parseCvPdf(pdfBuf);
                if (pdfText) {
                  textParts.push(`\n--- Linked Resume PDF ---\n${pdfText}`);
                  combined = textParts.join('\n\n').trim();
                }
              }
            }
          }
        } catch (_) {}
      }
    }

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
 * Extract social, portfolio, and code repository links from candidate text or metadata.
 */
function extractLinksAndPortfolio(text = '', meta = {}) {
  let portfolio = meta.portfolio || '';
  let github = '';
  let linkedin = '';
  let twitter = '';
  let leetcode = '';
  const links = [];

  if (!portfolio && meta.sourceType === 'url' && meta.sourceName) {
    if (!/github\.com|linkedin\.com/i.test(meta.sourceName)) {
      portfolio = meta.sourceName.trim();
    }
  }

  // GitHub regex
  const ghMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  if (ghMatch && !['topics', 'trending', 'features', 'pricing', 'login', 'signup', 'explore'].includes(ghMatch[1].toLowerCase())) {
    github = `https://github.com/${ghMatch[1]}`;
    links.push({ type: 'github', url: github, label: `github.com/${ghMatch[1]}` });
  }

  // LinkedIn regex
  const liMatch = text.match(/(?:https?:\/\/)?(?:[a-zA-Z]{2,3}\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  if (liMatch) {
    linkedin = `https://linkedin.com/in/${liMatch[1]}`;
    links.push({ type: 'linkedin', url: linkedin, label: `linkedin.com/in/${liMatch[1]}` });
  }

  // LeetCode regex
  const lcMatch = text.match(/(?:https?:\/\/)?(?:www\.)?leetcode\.com\/(?:u\/)?([a-zA-Z0-9_-]+)/i);
  if (lcMatch && !['problemset', 'contest', 'explore'].includes(lcMatch[1].toLowerCase())) {
    leetcode = `https://leetcode.com/u/${lcMatch[1]}`;
    links.push({ type: 'leetcode', url: leetcode, label: `leetcode.com/${lcMatch[1]}` });
  }

  // Twitter / X
  const twMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})/i);
  if (twMatch && !['home', 'explore', 'notifications', 'messages'].includes(twMatch[1].toLowerCase())) {
    twitter = `https://x.com/${twMatch[1]}`;
    links.push({ type: 'twitter', url: twitter, label: `x.com/${twMatch[1]}` });
  }

  // Personal portfolio URL detection from text if not yet set
  if (!portfolio) {
    const withoutEmails = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
    const urlMatches = withoutEmails.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.(?:com|org|net|tech|dev|io|me|app|site|xyz|in|co)(?:\/[^\s,|]*)?/gi) || [];
    for (const u of urlMatches) {
      if (!/github|linkedin|twitter|x\.com|gmail|outlook|yahoo|google|adobe|microsoft|amazon|leetcode|codeforces|hackerrank|npm|medium|substack|youtube|b\.tech|m\.tech|socket\.io/i.test(u)) {
        const clean = u.trim().replace(/[.,;:)]+$/, '');
        portfolio = clean.startsWith('http') ? clean : `https://${clean}`;
        break;
      }
    }
  }

  if (portfolio && !links.some(l => l.type === 'portfolio')) {
    links.unshift({ type: 'portfolio', url: portfolio, label: portfolio.replace(/^https?:\/\/(?:www\.)?/, '') });
  }

  return { portfolio, github, linkedin, twitter, leetcode, links };
}

const GENERIC_SECTION_HEADING_REGEX = /^(?:[0-9]+[.\-)]\s*)?(?:about(?:\s+me)?|summary|overview|profile|home|experience|work\s+experience|professional\s+experience|employment\s+history|work\s+history|employment|relevant\s+experience|career\s+history|education|academic\s+background|academic\s+qualifications|academic\s+history|academics|qualifications|educational\s+background|degrees?|projects|featured\s+projects|personal\s+projects|key\s+projects|academic\s+projects|technical\s+projects|selected\s+projects|open\s*source(?:\s+projects)?|project\s+work|github\s+activity|contributions\s+in\s+the\s+past\s+year|technical\s+skills|skills(?:\s*&|\s+and|\s+technical)?|tech\s+stack|technologies|tools(?:\s*&\s*technologies)?|portfolio\s+skills|certifications?|licenses|awards?|achievements?|publications?|leadership|extracurricular|contact(?:\s+me)?|get\s+in\s+touch|links?)\s*:?$/i;

const SECTION_NOISE_LINE_REGEX = /^(?:0?\s*\d{1,2}(?:\s+\d{1,3})?|present|loading activity graph\.{0,3}|404:\s*this page could not be found\.?|this page could not be found\.?|next\.metadataoutlet|next\.metadata|next-size-adjust|viewport|⌘k)$/i;
const FOOTER_BOUNDARY_REGEX = /^(?:terminal(?:\s*\(.*\))?|light mode(?:\s*\(.*\))?|dark mode(?:\s*\(.*\))?|©\s*\d{4}\b|press\s+⌘k|portfolio skills\s*:?)$/i;

function isStandaloneSectionHeading(line = '', targetRegex = null) {
  const cleaned = line.replace(/^[#\s*]+|[:\s]+$/g, '').trim();
  if (!cleaned) return false;
  if (!targetRegex && FOOTER_BOUNDARY_REGEX.test(cleaned)) return true;
  if (cleaned.length > 52 || /\.$/.test(cleaned)) return false;
  if (targetRegex) return targetRegex.test(cleaned);
  return GENERIC_SECTION_HEADING_REGEX.test(cleaned);
}

/**
 * Detect whether a line is a tag-cloud / list of tech stack items rather than prose.
 */
function isTechStackTagLine(line = '') {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 220) return false;
  if (/[.!?:;]$/.test(trimmed) || trimmed.includes(':')) return false;
  if (/\b(?:is|are|was|were|have|has|had|which|that|where|when|allowing|providing|ensuring|delivering|leading|built|engineered|designed|users|platform|applications)\b/i.test(trimmed)) {
    return false;
  }
  const techHits = EXTENDED_SKILL_KEYWORDS.filter(k => k.regex.test(trimmed)).length;
  return techHits >= 2 || (techHits >= 1 && /[,]/.test(trimmed) && trimmed.split(',').length >= 2);
}

/**
 * Format a detected tech stack tag list cleanly for storage & pill rendering.
 */
function formatTechStackLine(line = '') {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.includes(',')) {
    return trimmed.split(',').map(s => s.trim()).filter(Boolean).join(', ');
  }
  const multiWordTech = [
    'React Native', 'Tailwind CSS v4', 'Tailwind CSS', 'Next.js 16', 'React 19',
    'Server-Sent Events', 'Cloudflare TURN', 'YouTube Data API', 'Supabase Realtime',
    'PostgreSQL RLS', 'REST APIs', 'Cloud Deployment', 'Prisma ORM', 'Upstash Redis',
    'QStash Cron', 'EAS Build', 'TanStack Query', 'WebRTC Mesh', 'Groq API',
    'Mobile UI', 'Brevo API', 'GitHub Actions'
  ];
  let working = trimmed;
  const extracted = [];
  for (const term of multiWordTech) {
    const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (rx.test(working)) {
      const m = working.match(rx);
      if (m) extracted.push(m[0]);
      working = working.replace(rx, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  const leftovers = working.split(/\s+/).filter(Boolean);
  return [...extracted, ...leftovers].join(', ');
}

/**
 * Extract all non-empty section blocks matching a heading regex, automatically
 * skipping empty top-navbar links (e.g. "About\nExperience\nProjects\nSkills\nContact").
 */
function extractSectionBlocks(text = '', headerRegex) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (isStandaloneSectionHeading(lines[i], headerRegex)) {
      const collected = [];
      let j = i + 1;
      while (j < lines.length && !isStandaloneSectionHeading(lines[j])) {
        collected.push(lines[j]);
        j++;
      }
      if (collected.length > 0) {
        blocks.push(collected.join('\n'));
      }
      i = j - 1;
    }
  }
  return blocks;
}

/**
 * Extract structured work experience entries from raw resume or portfolio text.
 */
function extractStructuredExperience(text = '') {
  const experiences = [];
  const expHeaderRegex = /^(?:[0-9]+[.\-)]\s*)?(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|experience|employment|relevant\s+experience|career\s+history)$/i;
  const blocks = extractSectionBlocks(text, expHeaderRegex);
  if (blocks.length === 0) return experiences;

  const expSectionText = blocks.join('\n');
  const lines = expSectionText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !SECTION_NOISE_LINE_REGEX.test(l));

  const bulletSymbolRegex = /^[•\-\*–—▪▫◦⁃\+>]\s*|^\d+[\.\)]\s*/;
  const dateRegex = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*['’]?\s*)?(?:20\d{2}|19\d{2}|\d{2}\/\d{4})\s*[-–—to]+\s*(?:present|current|now|till\s*date|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*['’]?\s*)?(?:20\d{2}|19\d{2}|\d{2}\/\d{4}))/i;
  const actionVerbRegex = /^(?:developed|built|managed|led|created|implemented|designed|engineered|architected|maintained|reduced|increased|spearheaded|optimized|automated|collaborated|integrated|deployed|configured|resolved|authored|trained|researched|conducted|established|coordinated|assisted|executed|wrote|delivered|launched|formulated|programmed|tested|enhanced|scaled|analyzed|refactored|secured|streamlined|supervised|administered|worked|contributed|improved|migrated|leading|building)\b/i;
  const roleHintRegex = /\b(?:software|senior|junior|lead|principal|staff|frontend|front-end|backend|back-end|full[- ]?stack|devops|data|machine\s*learning|ml|ai|sde|intern|engineer|developer|consultant|architect|manager|analyst|specialist|officer|director|associate|trainee|founder|co-founder|designer|qa|tester)\b/i;
  const companySuffixRegex = /\b(?:inc\.?|llc|ltd\.?|pvt\.?|limited|corp\.?|technologies|technology|consultancy|consulting|solutions|systems|labs|studio|studios|digital|agency|ventures|group|services|networks)\b/i;

  const hasDateWithinNext = (idx, maxOffset = 2) => {
    for (let k = idx; k <= Math.min(lines.length - 1, idx + maxOffset); k++) {
      if (dateRegex.test(lines[k])) return true;
    }
    return false;
  };

  let currExp = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(?:view more|show more|read more|see all)$/i.test(line)) continue;

    const isBullet = bulletSymbolRegex.test(line);
    const cleanText = line.replace(bulletSymbolRegex, '').trim();
    const hasDate = dateRegex.test(line);
    const isAction = actionVerbRegex.test(cleanText);
    const isPureDateLine = hasDate && cleanText.length <= 42 && !/[a-zA-Z]{5,}/.test(cleanText.replace(/(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|present|current|now|till|date|to)/gi, ''));
    const isLabeledBullet = /^[A-Z][^:.!?]{2,48}\s:\s+[A-Z]/.test(cleanText);
    const isProseSentence = cleanText.length > 75 || (/[.!?]$/.test(cleanText) && cleanText.includes(' '));

    if (currExp && isPureDateLine && !currExp.duration) {
      const dm = line.match(dateRegex);
      if (dm) currExp.duration = dm[0].trim();
      continue;
    }

    if (currExp && !isBullet && !hasDate && isTechStackTagLine(cleanText)) {
      const formatted = formatTechStackLine(cleanText);
      currExp.techStack = currExp.techStack ? `${currExp.techStack}, ${formatted}` : formatted;
      currExp._afterTech = true;
      continue;
    }

    if (
      currExp &&
      !currExp._afterTech &&
      !isBullet &&
      !isAction &&
      !hasDate &&
      !isLabeledBullet &&
      !isProseSentence &&
      currExp.bullets.length === 0 &&
      !currExp.summary &&
      cleanText.length <= 65
    ) {
      if (!currExp.company) {
        const compParts = cleanText.split(/\s*[•|]\s*/);
        const candSecond = compParts[0].trim();
        const candLoc = compParts[1] ? compParts[1].trim() : '';
        if (companySuffixRegex.test(currExp.role) && !companySuffixRegex.test(candSecond)) {
          currExp.company = currExp.role;
          currExp.role = candSecond;
        } else {
          currExp.company = candSecond;
        }
        if (candLoc && !currExp.location) currExp.location = candLoc;
        continue;
      } else if (!currExp.role && roleHintRegex.test(cleanText)) {
        currExp.role = cleanText;
        continue;
      } else if (
        !currExp.location &&
        (INDIAN_CITIES_REGEX.test(cleanText) || US_CITIES_REGEX.test(cleanText) || /\b(?:remote|hybrid|on-?site|india)\b/i.test(cleanText) || cleanText.length <= 32)
      ) {
        currExp.location = cleanText;
        continue;
      }
    }

    const cardAlreadyPopulated = Boolean(currExp && (currExp.duration || currExp.bullets.length > 0 || currExp.summary));
    const looksLikeNewHeader = !isBullet && !isAction && !isLabeledBullet && !isProseSentence && cleanText.length <= 78;
    const isNewEntry = !currExp ||
      (currExp._afterTech && looksLikeNewHeader) ||
      (cardAlreadyPopulated && looksLikeNewHeader && (
        (hasDate && !isPureDateLine) ||
        hasDateWithinNext(i + 1, 2)
      ));

    if (isNewEntry) {
      if (currExp && (currExp.role || currExp.company || currExp.bullets.length > 0)) {
        const { _afterTech, ...finalExp } = currExp;
        experiences.push(finalExp);
      }
      const dm = line.match(dateRegex);
      const duration = dm ? dm[0].trim() : '';
      let beforeDate = dm ? (line.slice(0, dm.index) + ' ' + line.slice(dm.index + dm[0].length)).trim() : line;
      beforeDate = beforeDate.replace(/\(\s*\)|\[\s*\]/g, '').replace(/[|\-–—,\s]+$/, '').trim();

      let role = '';
      let company = '';
      let loc = '';

      const atSplit = beforeDate.split(/\s+(?:at|@)\s+/i);
      if (atSplit.length >= 2) {
        role = atSplit[0].trim();
        const rightParts = atSplit.slice(1).join(' ').split(/[–—|]/);
        company = rightParts[0].trim();
        loc = rightParts[1] ? rightParts[1].trim() : '';
      } else {
        const parts = beforeDate.split(/\s*[–—\-|]\s*/);
        const roleCompPart = parts[0] ? parts[0].trim() : beforeDate;
        const commaParts = roleCompPart.split(',');
        role = commaParts[0] ? commaParts[0].trim() : '';
        company = commaParts[1] ? commaParts[1].trim() : (parts[1] ? parts[1].trim() : '');
        loc = parts[2] ? parts[2].trim() : (commaParts[1] && parts[1] ? parts[1].trim() : '');
      }

      if (!role && company) {
        role = company;
        company = '';
      }

      const cleanRole = role.replace(/^[#\*\-=\+_\[\]\(\)\d\.\sI|:]+/, '').replace(/[(\[]+$/, '').trim();
      const cleanComp = company.replace(/[#\*\-=\+_\[\]\(\)\s|:]+$/, '').trim();
      const singleCompanyOnly = !cleanComp && cleanRole && (companySuffixRegex.test(cleanRole) || !roleHintRegex.test(cleanRole));

      currExp = {
        role: singleCompanyOnly ? '' : cleanRole,
        company: singleCompanyOnly ? cleanRole : cleanComp,
        location: loc.trim(),
        duration,
        summary: '',
        bullets: [],
        techStack: '',
        _afterTech: false
      };
    } else if (currExp) {
      if (!isBullet && !isLabeledBullet && isProseSentence && !currExp.summary && currExp.bullets.length === 0) {
        currExp.summary = cleanText;
      } else if (isBullet || isLabeledBullet || isAction || currExp.bullets.length === 0) {
        if (cleanText) currExp.bullets.push(cleanText);
      } else if (currExp.bullets.length > 0 && line.length > 0) {
        currExp.bullets[currExp.bullets.length - 1] += ' ' + line;
      }
    }
  }

  if (currExp && (currExp.role || currExp.company || currExp.bullets.length > 0)) {
    const { _afterTech, ...finalExp } = currExp;
    experiences.push(finalExp);
  }

  // Post-processing consolidation pass: unite any fragmented sub-blocks into their parent company
  const consolidated = [];
  for (const exp of experiences) {
    const comp = (exp.company || '').trim();
    const role = (exp.role || '').trim();
    const isSpurious = /^(?:leading|building|engineering|developing|multi|api integration)\b/i.test(comp) ||
      /^(?:project client delivery|connected client)\b/i.test(role) ||
      (!comp && !role);

    if (isSpurious && consolidated.length > 0) {
      const prev = consolidated[consolidated.length - 1];
      if (exp.summary && !prev.summary) prev.summary = exp.summary;
      else if (comp && !comp.toLowerCase().startsWith('multi') && !prev.summary) {
        prev.summary = comp + (role ? ` • ${role}` : '');
      }
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          if (!prev.bullets.includes(b)) prev.bullets.push(b);
        }
      }
      if (exp.techStack) {
        const existingTech = (prev.techStack || '').split(',').map(s => s.trim()).filter(Boolean);
        const newTech = exp.techStack.split(',').map(s => s.trim()).filter(Boolean);
        prev.techStack = [...new Set([...existingTech, ...newTech])].join(', ');
      }
    } else if (!isSpurious && (comp || role)) {
      consolidated.push(exp);
    }
  }

  const seenExp = new Set();
  return consolidated.filter(e => {
    if (!e.role && !e.company) return false;
    const key = `${(e.role || '').toLowerCase()}|${(e.company || '').toLowerCase()}|${(e.duration || '').toLowerCase()}`;
    if (seenExp.has(key)) return false;
    seenExp.add(key);
    return true;
  });
}

/**
 * Extract structured education records from raw resume or portfolio text.
 */
function extractStructuredEducation(text = '') {
  const educationEntries = [];
  const eduHeaderRegex = /^(?:[0-9]+[.\-)]\s*)?(?:education|academic\s+background|academic\s+qualifications|academic\s+history|academics|qualifications|educational\s+background|degrees?)$/i;
  const blocks = extractSectionBlocks(text, eduHeaderRegex);
  if (blocks.length === 0) return educationEntries;

  const eduSectionText = blocks.join('\n');
  const lines = eduSectionText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !SECTION_NOISE_LINE_REGEX.test(l) && !FOOTER_BOUNDARY_REGEX.test(l) && !/^(?:github|linkedin|email|resume|twitter|contact|home|projects|skills)$/i.test(l));

  const yearRegex = /\b\d{4}\s*[-–—to]+\s*(?:\d{4}|present|expected\s+\d{4})\b|\b(?:19|20)\d{2}\b/i;
  const bulletSymbolRegex = /^[•\-\*–—▪▫◦⁃\+>]\s*|^\d+[\.\)]\s*/;

  let currEdu = null;
  for (const line of lines) {
    const cleanText = line.replace(bulletSymbolRegex, '').trim();
    const yrMatch = line.match(yearRegex);
    const isDetailLine = /\b(?:gpa|cgpa|grade|score|percentage|honors|distinction|major|minor|coursework)\b/i.test(cleanText) && !/\b(?:b\.?tech|b\.?e\b|b\.?sc|m\.?tech|mca|bca|bachelor|master)\b/i.test(cleanText);
    const hasDegreeKeyword = /\b(?:b\.?tech|b\.?e\b|b\.?sc|m\.?tech|mca|bca|m\.?s\b|ph\.?d|bachelor|master|degree|diploma|associate|high\s*school|12th|10th)\b/i.test(cleanText);
    const hasInstKeyword = /\b(?:university|college|institute|school|academy|campus|iit|nit|bits|iiit|makaut|jncu)\b/i.test(cleanText);
    const isPureYearLine = yrMatch && cleanText.length <= 28 && !/[a-zA-Z]{5,}/.test(cleanText.replace(/present|expected/gi, ''));

    if (isDetailLine && currEdu) {
      currEdu.details = currEdu.details ? `${currEdu.details} • ${cleanText}` : cleanText;
    } else if (currEdu && isPureYearLine && !currEdu.year) {
      currEdu.year = yrMatch[0].trim();
    } else if (currEdu && !currEdu.degree && hasDegreeKeyword) {
      currEdu.degree = cleanText.replace(/\s*\((?:19|20)\d\d.*?\)/, '').trim();
      if (yrMatch && !currEdu.year) currEdu.year = yrMatch[0].trim();
    } else if (currEdu && !currEdu.institution && hasInstKeyword) {
      currEdu.institution = cleanText.replace(/\b(?:19|20)\d{2}.*$/, '').replace(/[,\-–—|\s]+$/, '').trim();
      if (yrMatch && !currEdu.year) currEdu.year = yrMatch[0].trim();
    } else {
      if (currEdu && (currEdu.institution || currEdu.degree)) {
        educationEntries.push(currEdu);
      }
      const year = yrMatch ? yrMatch[0].trim() : '';
      const titlePart = yrMatch
        ? line.replace(yrMatch[0], '').replace(/\(\s*\)/g, '').replace(/[|\-–—,\s]+$/, '').trim()
        : line;
      const parts = titlePart.split(/[,|–—]/).map(s => s.trim()).filter(Boolean);
      const bothPresent = hasInstKeyword && hasDegreeKeyword && parts.length >= 2;
      currEdu = {
        institution: bothPresent
          ? (parts.find(pt => /\b(?:university|college|institute|school|academy|campus|iit|nit|bits|iiit|makaut|jncu)\b/i.test(pt)) || parts[0])
          : (hasInstKeyword || !hasDegreeKeyword ? (parts[0] || titlePart) : ''),
        degree: bothPresent
          ? (parts.find(pt => /\b(?:b\.?tech|b\.?e\b|b\.?sc|m\.?tech|mca|bca|m\.?s\b|ph\.?d|bachelor|master|degree|diploma|associate)\b/i.test(pt)) || parts[1])
          : (hasDegreeKeyword ? cleanText.replace(/\s*\((?:19|20)\d\d.*?\)/, '').trim() : (parts[1] || '')),
        year,
        details: ''
      };
    }
  }

  if (currEdu && (currEdu.institution || currEdu.degree)) {
    educationEntries.push(currEdu);
  }

  const seenEdu = new Set();
  return educationEntries.filter(e => {
    if (!e.institution && !e.degree) return false;
    const key = `${(e.degree || '').toLowerCase()}|${(e.institution || '').toLowerCase()}`;
    if (seenEdu.has(key)) return false;
    seenEdu.add(key);
    return true;
  });
}

/**
 * Extract structured projects from raw resume or portfolio text.
 */
function extractStructuredProjects(text = '') {
  const projects = [];
  const projHeaderRegex = /^(?:[0-9]+[.\-)]\s*)?(?:technical\s+projects|featured\s+projects|personal\s+projects|key\s+projects|academic\s+projects|projects\s*(?:&|and)\s*initiatives|projects|project\s+work|selected\s+projects|recent\s+projects(?:\s*&\s*codebases)?|what\s+i(?:'|’)?ve\s+built)$/i;
  const blocks = extractSectionBlocks(text, projHeaderRegex);
  if (blocks.length === 0) return projects;

  const projSectionText = blocks.join('\n');
  const rawLines = projSectionText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const projNoiseRegex = /^(?:view project|live demo|source code|github|demo|view live|visit site|view system architecture.*|key features(?:\s*&\s*architecture)?|features|(?:api\s+)?code(?:\s+(?:live|download\s*apk|demo))?|download\s*apk|all\s+real-time.*tools|all\s+projects)$/i;
  const lines = rawLines.filter(l => !SECTION_NOISE_LINE_REGEX.test(l) && !projNoiseRegex.test(l));

  const bulletSymbolRegex = /^[•\-\*–—▪▫◦⁃\+>]\s*|^\d+[\.\)]\s*/;
  const actionVerbRegex = /^(?:developed|built|managed|led|created|implemented|designed|engineered|architected|maintained|reduced|increased|spearheaded|optimized|automated|collaborated|integrated|deployed|configured|resolved|authored|trained|researched|conducted|established|coordinated|assisted|executed|wrote|delivered|launched|formulated|programmed|tested|enhanced|scaled|analyzed|refactored|secured|streamlined)\b/i;

  let currProj = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = bulletSymbolRegex.test(line);
    const cleanText = line.replace(bulletSymbolRegex, '').trim();
    const isExplicitTechLabel = /^•?\s*(?:tech(?:\s*stack)?|technologies(?:\s*used)?|tools|stack)\s*[:–—\-]\s*/i.test(line);
    const isAction = actionVerbRegex.test(cleanText);
    const isLabeledBullet = /^[A-Z0-9][^:.!?]{2,52}\s:\s+/.test(cleanText);
    const isBranchBadgeLine = /^main\s+.+$/i.test(cleanText) && cleanText.length <= 75;
    const isProseSentence = cleanText.length > 70 || (/[.!?]$/.test(cleanText) && cleanText.includes(' '));
    const isTagLine = !isBullet && !isLabeledBullet && isTechStackTagLine(cleanText);

    if (currProj && (isExplicitTechLabel || isTagLine)) {
      const rawTech = isExplicitTechLabel
        ? line.replace(/^•?\s*(?:tech(?:\s*stack)?|technologies(?:\s*used)?|tools|stack)\s*[:–—\-]\s*/i, '').trim()
        : formatTechStackLine(cleanText);
      currProj.techStack = currProj.techStack ? `${currProj.techStack}, ${rawTech}` : rawTech;
      currProj._complete = true;
      continue;
    }

    if (currProj && !currProj._complete && isBranchBadgeLine && !currProj.tagline) {
      currProj.tagline = cleanText
        .replace(/^main\s+/i, '')
        .replace(/\s+(?:live|apk ready|beta|wip)$/i, '')
        .trim();
      continue;
    }

    const nextIsBadgeOrProse = i + 1 < lines.length && (
      /^main\s+/i.test(lines[i + 1]) ||
      lines[i + 1].length > 75
    );

    const looksLikeProjectTitle = !isBullet &&
      !isAction &&
      !isLabeledBullet &&
      !isProseSentence &&
      !isBranchBadgeLine &&
      cleanText.length <= 65 &&
      cleanText.split(/\s+/).length <= 7;

    if (!currProj || (looksLikeProjectTitle && (currProj._complete || nextIsBadgeOrProse))) {
      if (currProj && (currProj.name || currProj.bullets.length > 0)) {
        const { _complete, ...finalProj } = currProj;
        projects.push(finalProj);
      }
      const cleanLine = cleanText.replace(/[§Š€#]+$/, '').trim();
      const pParts = cleanLine.split(/[—–|]/);
      currProj = {
        name: pParts[0] ? pParts[0].trim() : cleanLine,
        tagline: pParts[1] ? pParts[1].trim() : '',
        summary: '',
        bullets: [],
        techStack: pParts[2] ? pParts[2].trim() : '',
        _complete: false
      };
      continue;
    }

    if (currProj) {
      if (!isBullet && !isLabeledBullet && isProseSentence && !currProj.summary && currProj.bullets.length === 0) {
        currProj.summary = cleanText;
      } else if (isBullet || isLabeledBullet || isAction || currProj.bullets.length === 0) {
        if (cleanText) currProj.bullets.push(cleanText);
      } else if (currProj.bullets.length > 0) {
        currProj.bullets[currProj.bullets.length - 1] += ' ' + cleanText;
      }
    }
  }

  if (currProj && (currProj.name || currProj.bullets.length > 0)) {
    const { _complete, ...finalProj } = currProj;
    projects.push(finalProj);
  }

  const seenProj = new Set();
  return projects.filter(p => {
    if (!p.name) return false;
    const key = p.name.toLowerCase();
    if (seenProj.has(key)) return false;
    seenProj.add(key);
    return true;
  });
}

/**
 * Categorize skills list into languages, frameworks, databases, and tools.
 */
function categorizeSkills(skills = []) {
  const categorized = {
    languages: [],
    frameworks: [],
    databases: [],
    tools: []
  };

  const seen = new Set();
  for (const s of skills) {
    if (!s || typeof s !== 'string') continue;
    const trimmed = s.trim();
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (/\b(?:javascript|typescript|python|java\b|c\+\+|c#|\.net|golang|go\b|rust|ruby|php|sql|html|css|bash|shell|swift|kotlin|c\b|r\b|scala|dart|lua)\b/i.test(trimmed)) {
      categorized.languages.push(trimmed);
    } else if (/\b(?:react|next|vue|angular|svelte|node|express|django|flask|spring|fastapi|graphql|redux|tailwind|bootstrap|rest|restful|pytorch|tensorflow|keras|pandas|numpy|scikit|microservices|nest|hono|astro|nuxt|rails|laravel)\b/i.test(trimmed)) {
      categorized.frameworks.push(trimmed);
    } else if (/\b(?:postgres|postgresql|mongo|mongodb|redis|mysql|dynamodb|cassandra|elasticsearch|firebase|supabase|sqlite|mariadb|oracle|neo4j)\b/i.test(trimmed)) {
      categorized.databases.push(trimmed);
    } else {
      categorized.tools.push(trimmed);
    }
  }

  return categorized;
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

  // Explicit Name marker check (prioritize Candidate Name / Full Name before generic Name:)
  const explicitNameMatch = text.match(/(?:^|\n)\s*(?:Candidate Name|Full Name):\s*([^\r\n|;,]+)/i) ||
    text.match(/(?:^|\n)\s*(?:Author|Hero Heading|Name):\s*([^\r\n|;,]+)/i);
  if (explicitNameMatch) {
    const candidateName = explicitNameMatch[1].trim()
      .replace(/^(?:hi|hello|hey)[,!]?\s+(?:i['’]?m|i am|this is)\s+/i, '')
      .replace(/^(?:portfolio|resume|profile)\s+(?:of|for)\s+/i, '')
      .replace(/\s*(?:[-–—|:]\s*)(?:portfolio|developer|engineer|software|full[\s-]*stack|frontend|front[\s-]*end|backend|back[\s-]*end|homepage|official|home).*$/i, '')
      .replace(/\s+(?:portfolio|website)$/i, '')
      .trim();
    if (
      candidateName.length >= 2 &&
      candidateName.length <= 50 &&
      /^[a-zA-ZÀ-ÿ\s.'-]+$/.test(candidateName) &&
      !/^(?:software|full[\s-]*stack|frontend|backend|developer|engineer|designer|welcome|portfolio|home|hello|hey|about|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(candidateName)
    ) {
      name = candidateName;
    }
  }

  // Name inference: check <title> (both "Siddharth Mishra" and "Siddharth | Full-Stack Developer")
  if (!name) {
    const titleLineMatch = text.match(/(?:^|\n)\s*Title:\s*([^\r\n]{2,70})/i);
    if (titleLineMatch) {
      const cleanedTitle = titleLineMatch[1].trim()
        .replace(/\s*[-|–—:]\s*(?:portfolio|developer|engineer|software|full[\s-]*stack|frontend|front[\s-]*end|backend|back[\s-]*end|sde|mern|homepage|official|web|tech).*$/i, '')
        .split(/[|–—]/)[0]
        .trim();
      if (
        cleanedTitle.length >= 2 &&
        cleanedTitle.length <= 45 &&
        /^[a-zA-ZÀ-ÿ\s.'-]+$/.test(cleanedTitle) &&
        !/^(?:portfolio|home|welcome|developer|engineer|resume|cv|software|about)$/i.test(cleanedTitle)
      ) {
        name = cleanedTitle;
      }
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
  const explicitHeadline = text.match(/(?:^|\n)\s*Headline:\s*([^\r\n]{2,100})/i);
  let headline = explicitHeadline?.[1]?.trim() || '';
  const roleKeywords = [
    'Full-Stack Developer', 'Full Stack Developer', 'Full-Stack Engineer', 'Full Stack Engineer',
    'MERN Stack Developer', 'Frontend Developer', 'Front-End Developer', 'Frontend Engineer',
    'Backend Developer', 'Back-End Developer', 'Backend Engineer', 'Software Developer',
    'Software Engineer', 'Junior Web Developer', 'DevOps Engineer', 'Machine Learning Engineer',
    'AI Engineer', 'Data Scientist', 'Cloud Engineer', 'System Architect', 'Mobile Developer',
    'React Developer', 'Node.js Developer', 'Python Developer', 'Product Engineer',
    'Junior Software Developer', 'UI/UX Designer'
  ];
  if (!headline) {
    const titleRoleMatch = text.match(/(?:^|\n)\s*Title:\s*[^\n|–—-]{2,40}\s*[|–—-]\s*([^\r\n|]{3,65})/i);
    if (titleRoleMatch?.[1] && !/^(?:portfolio|home|official|website|welcome)$/i.test(titleRoleMatch[1].trim())) {
      headline = titleRoleMatch[1].trim();
    }
  }
  if (!headline) {
    for (const rk of roleKeywords) {
      if (new RegExp(`\\b${rk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
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

  // Check explicit Location / Based in markers first (handles smaller towns like Ballia too)
  const explicitLocMatch = text.match(/(?:^|\n)\s*(?:Location|Based in|City|Address)\s*:\s*([^\r\n]{2,80})/i) ||
    text.match(/\bbased in\s+([A-Z][a-zA-Z\s]{1,30}(?:,\s*[A-Za-z\s]{2,30}){0,2})/i);
  const explicitLocStr = explicitLocMatch?.[1]?.trim() || '';

  // Check explicit country & city markers
  const indCityMatch = text.match(INDIAN_CITIES_REGEX);
  const indLocMatch = text.match(INDIAN_LOCATIONS_REGEX);
  const usCityMatch = text.match(US_CITIES_REGEX);
  const usLocMatch = text.match(US_LOCATIONS_REGEX);

  if (indCityMatch || indLocMatch || (explicitLocStr && INDIAN_LOCATIONS_REGEX.test(explicitLocStr))) {
    country = 'India';
    if (explicitLocStr) {
      const locFirstPart = explicitLocStr.split(',')[0].trim();
      if (INDIAN_CITIES_REGEX.test(locFirstPart)) {
        city = capitalize(locFirstPart);
      } else if (locFirstPart && locFirstPart.length <= 28 && !INDIAN_LOCATIONS_REGEX.test(locFirstPart) && /^[a-zA-Z\s.-]+$/.test(locFirstPart)) {
        city = capitalize(locFirstPart);
      }
    }
    if (!city && indCityMatch) {
      city = capitalize(indCityMatch[0]);
    }
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

  // 3. Extract EXPERIENCE / WORK HISTORY section specifically (skipping empty navbar items)
  // to prevent education/college dates from being erroneously summed into work experience!
  const expHeaderRegex = /^(?:[0-9]+[.\-)]\s*)?(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|experience|employment|relevant\s+experience|career\s+history)$/i;
  const expBlocks = extractSectionBlocks(text, expHeaderRegex);
  const expSectionText = expBlocks.length > 0 ? expBlocks.join('\n') : text;

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
  const eduHeaderRegexForSummary = /^(?:[0-9]+[.\-)]\s*)?(?:education|academic\s+background|academic\s+qualifications|academic\s+history|academics|qualifications|educational\s+background|degrees?)$/i;
  const eduBlocksForSummary = extractSectionBlocks(text, eduHeaderRegexForSummary);
  const educationText = eduBlocksForSummary.length > 0 ? eduBlocksForSummary.join('\n') : text;
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

  // Extract structured links, experience, education, projects, and categorized skills
  const extractedLinks = extractLinksAndPortfolio(text, meta);
  const structuredExperience = extractStructuredExperience(text);
  const structuredEducation = extractStructuredEducation(text);
  const structuredProjects = extractStructuredProjects(text);
  const categorizedSkills = categorizeSkills(candidateSkills);

  // Fallback headline to most recent structured role if still empty
  if (!headline && structuredExperience.length > 0 && structuredExperience[0].role) {
    headline = structuredExperience[0].role;
  }

  // If highest degree string was not found but structured education was extracted, use it
  if (!education && structuredEducation.length > 0) {
    const firstEdu = structuredEducation[0];
    education = firstEdu.degree ? `${firstEdu.degree}${firstEdu.institution ? ` from ${firstEdu.institution}` : ''}` : firstEdu.institution;
  }

  return {
    sourceType: meta.sourceType || 'manual',
    sourceName: meta.sourceName || (meta.sourceType === 'url' ? 'Portfolio Website' : 'Uploaded CV'),
    parsedAt: new Date().toISOString(),
    name: name || meta.name || '',
    email,
    phone,
    headline,
    portfolio: extractedLinks.portfolio || meta.portfolio || '',
    github: extractedLinks.github || meta.github || '',
    linkedin: extractedLinks.linkedin || meta.linkedin || '',
    twitter: extractedLinks.twitter || meta.twitter || '',
    leetcode: extractedLinks.leetcode || meta.leetcode || '',
    links: extractedLinks.links || [],
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
    skillsByCategory: categorizedSkills,
    education,
    educationEntries: structuredEducation,
    experience: structuredExperience,
    projects: structuredProjects,
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
    portfolio: meta.portfolio || '',
    github: meta.github || '',
    linkedin: meta.linkedin || '',
    twitter: '',
    leetcode: '',
    links: [],
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
    skillsByCategory: { languages: [], frameworks: [], databases: [], tools: [] },
    education: '',
    educationEntries: [],
    experience: [],
    projects: [],
    textLength: 0,
    rawSnippet: '',
    rawCvText: ''
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = {
  parseCvPdf,
  parsePortfolioUrl,
  extractCandidateProfile,
  extractLinksAndPortfolio,
  extractStructuredExperience,
  extractStructuredEducation,
  extractStructuredProjects,
  categorizeSkills
};
