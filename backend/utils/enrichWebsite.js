const { URL } = require('url');

// Track last request time per host for polite 1 req/sec rate limiting
const hostLastRequestMap = new Map();

/**
 * Polite rate limiter: ensures at least 1000ms delay between requests to the same hostname
 */
async function rateLimitHost(hostname) {
  const now = Date.now();
  const last = hostLastRequestMap.get(hostname) || 0;
  const elapsed = now - last;
  if (elapsed < 1050) {
    const delay = 1050 - elapsed;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  hostLastRequestMap.set(hostname, Date.now());
}

/**
 * Checks robots.txt to determine if a path is allowed
 */
async function isAllowedByRobots(originUrl, pathToCheck) {
  try {
    const parsed = new URL(originUrl);
    const robotsUrl = `${parsed.origin}/robots.txt`;

    await rateLimitHost(parsed.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobRadar/1.0 (+https://github.com/jobradar; polite job directory bot; contact: sid@jobradar.local)'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // 404 or not found means no disallow rules
      return true;
    }

    const text = await res.text();
    const lines = text.split('\n');
    let appliesToUs = false;
    const disallows = [];

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const uaMatch = line.match(/^User-agent:\s*(.+)$/i);
      if (uaMatch) {
        const agent = uaMatch[1].trim();
        appliesToUs = agent === '*' || agent.toLowerCase().includes('jobradar');
        continue;
      }

      if (appliesToUs) {
        const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
        if (disallowMatch) {
          const rule = disallowMatch[1].trim();
          if (rule) disallows.push(rule);
        }
      }
    }

    // Check if path is disallowed
    for (const rule of disallows) {
      if (rule === '/') return false;
      if (pathToCheck.startsWith(rule)) return false;
    }

    return true;
  } catch {
    // If robots.txt check fails or times out, proceed politely
    return true;
  }
}

/**
 * Polite fetch with timeout and user-agent
 */
async function politeFetch(targetUrl) {
  const parsed = new URL(targetUrl);
  await rateLimitHost(parsed.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobRadar/1.0 (+https://github.com/jobradar; polite job directory bot; contact: sid@jobradar.local)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });
    clearTimeout(timeout);

    // Check if site blocks us
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { blocked: true, status: res.status, html: null };
    }

    if (!res.ok) {
      return { error: true, status: res.status, html: null };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { nonHtml: true, html: null };
    }

    const html = await res.text();

    // Check for JS-only / Cloudflare / bot challenge
    if (
      html.includes('cf-browser-verification') ||
      html.includes('challenge-running') ||
      html.includes('Attention Required! | Cloudflare') ||
      (html.includes('enable JavaScript') && html.length < 2500)
    ) {
      return { blocked: true, needsJs: true, html: null };
    }

    return { success: true, html, finalUrl: res.url };
  } catch (err) {
    clearTimeout(timeout);
    return { error: true, message: err.message, html: null };
  }
}

/**
 * Extracts ATS links, careers URLs, emails, phones, schema JobPosting, and address from HTML
 */
function extractFromHtml(html, currentUrl) {
  const result = {
    careersUrl: null,
    atsType: null,
    atsSlug: null,
    emails: [],
    phones: [],
    addresses: [],
    jobPostings: [],
    techEvidence: []
  };

  if (!html || typeof html !== 'string') return result;

  // 1. ATS Links & Slugs
  const greenhouseMatch = html.match(/(?:https?:)?\/\/(?:boards|job-boards)\.(?:eu\.)?greenhouse\.io\/([a-zA-Z0-9_\-]+)/i);
  if (greenhouseMatch) {
    result.atsType = 'greenhouse';
    result.atsSlug = greenhouseMatch[1];
    result.careersUrl = greenhouseMatch[0].startsWith('http') ? greenhouseMatch[0] : `https:${greenhouseMatch[0]}`;
  }

  const leverMatch = html.match(/(?:https?:)?\/\/jobs\.lever\.co\/([a-zA-Z0-9_\-]+)/i);
  if (!result.atsType && leverMatch) {
    result.atsType = 'lever';
    result.atsSlug = leverMatch[1];
    result.careersUrl = leverMatch[0].startsWith('http') ? leverMatch[0] : `https:${leverMatch[0]}`;
  }

  const ashbyMatch = html.match(/(?:https?:)?\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_\-]+)/i);
  if (!result.atsType && ashbyMatch) {
    result.atsType = 'ashby';
    result.atsSlug = ashbyMatch[1];
    result.careersUrl = ashbyMatch[0].startsWith('http') ? ashbyMatch[0] : `https:${ashbyMatch[0]}`;
  }

  const smartRecruitersMatch = html.match(/(?:https?:)?\/\/(?:careers|jobs)\.smartrecruiters\.com\/([a-zA-Z0-9_\-]+)/i);
  if (!result.atsType && smartRecruitersMatch) {
    result.atsType = 'smartrecruiters';
    result.atsSlug = smartRecruitersMatch[1];
    result.careersUrl = smartRecruitersMatch[0].startsWith('http') ? smartRecruitersMatch[0] : `https:${smartRecruitersMatch[0]}`;
  }

  // 2. Careers Page Links (if not already found via ATS)
  if (!result.careersUrl) {
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const linkText = match[2].toLowerCase();

      if (
        /careers|jobs|join\s*us|work\s*with\s*us|openings|we\s*are\s*hiring/i.test(linkText) ||
        /\/(careers|jobs|openings|join-us)(\/|$|\?)/i.test(href)
      ) {
        try {
          const resolved = new URL(href, currentUrl).href;
          if (resolved.startsWith('http')) {
            result.careersUrl = resolved;
            break;
          }
        } catch {}
      }
    }
  }

  // 3. Schema.org JobPosting Data
  const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonLdMatch[1]);
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      for (const item of items) {
        if (item['@type'] === 'JobPosting') {
          result.jobPostings.push({
            title: item.title,
            datePosted: item.datePosted,
            sourceUrl: currentUrl
          });
        }
      }
    } catch {}
  }

  // 4. Contact Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const foundEmails = new Set();

  // From mailto: links
  const mailtoRegex = /href=["']mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})[^"']*["']/gi;
  let mailtoMatch;
  while ((mailtoMatch = mailtoRegex.exec(html)) !== null) {
    foundEmails.add(mailtoMatch[1].toLowerCase());
  }

  // From visible text
  let emMatch;
  while ((emMatch = emailRegex.exec(html)) !== null) {
    const em = emMatch[0].toLowerCase();
    // Filter out common false positives (image names, schemas, placeholder domains)
    if (
      !em.endsWith('.png') &&
      !em.endsWith('.jpg') &&
      !em.endsWith('.jpeg') &&
      !em.endsWith('.svg') &&
      !em.endsWith('.webp') &&
      !em.includes('example.com') &&
      !em.includes('domain.com') &&
      !em.includes('sentry.io') &&
      !em.includes('w3.org')
    ) {
      foundEmails.add(em);
    }
  }

  for (const email of foundEmails) {
    result.emails.push({ value: email, sourceUrl: currentUrl });
  }

  // 5. Contact Phones
  const foundPhones = new Set();
  const telRegex = /href=["']tel:([^"']+)["']/gi;
  let telMatch;
  while ((telMatch = telRegex.exec(html)) !== null) {
    const rawTel = telMatch[1].replace(/[^\d+]/g, '').trim();
    if (rawTel.length >= 7 && rawTel.length <= 15) {
      foundPhones.add(rawTel);
    }
  }

  // Common Indian phone formats: +91 xxxxx xxxxx or 080-xxxxxxxx
  const phoneTextRegex = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
  let phMatch;
  while ((phMatch = phoneTextRegex.exec(html)) !== null) {
    const cleanPh = phMatch[0].trim();
    if (cleanPh.length >= 10) {
      foundPhones.add(cleanPh);
    }
  }

  for (const phone of foundPhones) {
    result.phones.push({ value: phone, sourceUrl: currentUrl });
  }

  // 6. Address Text
  const addressTagRegex = /<address[^>]*>([\s\S]*?)<\/address>/gi;
  let addrMatch;
  while ((addrMatch = addressTagRegex.exec(html)) !== null) {
    const cleanAddr = addrMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanAddr.length >= 15 && cleanAddr.length <= 250) {
      result.addresses.push({ address: cleanAddr, sourceUrl: currentUrl });
      break;
    }
  }

  // 7. Tech Classification Evidence
  const textContent = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  const techKeywords = [
    'software engineering',
    'software development',
    'saas platform',
    'cloud native',
    'product engineering',
    'full stack development',
    'mobile app development',
    'artificial intelligence platform'
  ];

  for (const kw of techKeywords) {
    if (textContent.includes(kw)) {
      result.techEvidence.push({
        what: `Website text mentions "${kw}"`,
        sourceUrl: currentUrl
      });
      break;
    }
  }

  return result;
}

/**
 * Enriches a single company by politely visiting its website and likely pages
 */
async function enrichCompanyWebsite(company) {
  if (!company.website) {
    return { skipped: true, reason: 'No website' };
  }

  let baseUrl = company.website.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return { skipped: true, reason: 'Invalid website URL' };
  }

  // Check robots.txt for root
  const isAllowedRoot = await isAllowedByRobots(parsedBase.origin, '/');
  if (!isAllowedRoot) {
    return { manual: true, reason: 'Robots.txt disallows root' };
  }

  // Fetch Homepage
  console.log(`[Enrich] Fetching homepage: ${parsedBase.origin}...`);
  const homeRes = await politeFetch(parsedBase.origin);

  if (homeRes.blocked || homeRes.needsJs) {
    return { manual: true, reason: 'Blocked / JS required' };
  }

  if (homeRes.error) {
    return { error: true, reason: homeRes.message || 'Fetch failed' };
  }

  const combined = {
    careersUrl: null,
    atsType: null,
    atsSlug: null,
    emails: [],
    phones: [],
    addresses: [],
    jobPostings: [],
    techEvidence: []
  };

  const mergeResults = (res) => {
    if (res.careersUrl && !combined.careersUrl) combined.careersUrl = res.careersUrl;
    if (res.atsType && !combined.atsType) combined.atsType = res.atsType;
    if (res.atsSlug && !combined.atsSlug) combined.atsSlug = res.atsSlug;

    for (const em of res.emails) {
      if (!combined.emails.some(e => e.value.toLowerCase() === em.value.toLowerCase())) {
        combined.emails.push(em);
      }
    }
    for (const ph of res.phones) {
      if (!combined.phones.some(p => p.value === ph.value)) {
        combined.phones.push(ph);
      }
    }
    for (const ad of res.addresses) {
      if (!combined.addresses.some(a => a.address === ad.address)) {
        combined.addresses.push(ad);
      }
    }
    for (const jp of res.jobPostings) {
      combined.jobPostings.push(jp);
    }
    for (const te of res.techEvidence) {
      if (!combined.techEvidence.some(t => t.what === te.what)) {
        combined.techEvidence.push(te);
      }
    }
  };

  // Extract from Homepage
  const homeData = extractFromHtml(homeRes.html, homeRes.finalUrl || parsedBase.origin);
  mergeResults(homeData);

  // Likely subpages: /careers, /jobs, /contact, /about
  const likelyPaths = ['/careers', '/jobs', '/contact', '/about'];

  for (const subPath of likelyPaths) {
    const subUrl = `${parsedBase.origin}${subPath}`;

    // Respect robots.txt
    const allowed = await isAllowedByRobots(parsedBase.origin, subPath);
    if (!allowed) {
      console.log(`[Enrich] Skipping ${subPath} (disallowed by robots.txt)`);
      continue;
    }

    console.log(`[Enrich] Polite fetch: ${subUrl}...`);
    const subRes = await politeFetch(subUrl);

    if (subRes.success && subRes.html) {
      const subData = extractFromHtml(subRes.html, subRes.finalUrl || subUrl);
      mergeResults(subData);
    }
  }

  return { success: true, data: combined };
}

module.exports = {
  enrichCompanyWebsite,
  isAllowedByRobots,
  politeFetch,
  extractFromHtml
};
