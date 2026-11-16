/**
 * ATS Detector Service
 * Automatically detects and verifies ATS providers (Greenhouse, Lever, Ashby,
 * SmartRecruiters, Workable, Recruitee, Workday) from company domains or career URLs.
 *
 * Invariant: Never fabricates slugs. Probes candidates and returns verified identifiers only.
 */

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const { rateLimitHost } = require('../utils/rateLimiter');
const { isPublicWebUrl } = require('../utils/ssrfGuard');

// Known ATS URL Regex Patterns
const ATS_PATTERNS = [
  {
    ats: 'greenhouse',
    regex: /(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io)\/(?:embed\/job_board\?for=|)([\w-]+)/i,
    testUrl: (slug) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    validator: (data) => Array.isArray(data?.jobs)
  },
  {
    ats: 'lever',
    regex: /jobs\.lever\.co\/([\w-]+)/i,
    testUrl: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    validator: (data) => Array.isArray(data)
  },
  {
    ats: 'ashby',
    regex: /jobs\.ashbyhq\.com\/([\w-]+)/i,
    testUrl: (slug) => `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`,
    postBody: (slug) => ({ operationName: 'ApiJobBoardWithTeams', variables: { organizationHostedJobsPageName: slug } }),
    validator: (data) => Array.isArray(data?.data?.jobBoard?.jobs)
  },
  {
    ats: 'smartrecruiters',
    regex: /(?:jobs|careers)\.smartrecruiters\.com\/([\w-]+)/i,
    testUrl: (slug) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=10`,
    validator: (data) => Array.isArray(data?.content)
  },
  {
    ats: 'workable',
    regex: /apply\.workable\.com\/([\w-]+)/i,
    testUrl: (slug) => `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`,
    postBody: () => ({ query: '' }),
    validator: (data) => Array.isArray(data?.results)
  },
  {
    ats: 'recruitee',
    regex: /([\w-]+)\.recruitee\.com/i,
    testUrl: (slug) => `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`,
    validator: (data) => Array.isArray(data?.offers)
  },
  {
    ats: 'personio',
    regex: /([\w-]+)\.jobs\.personio\.(?:de|com)/i,
    testUrl: (slug) => `https://${encodeURIComponent(slug)}.jobs.personio.de/xml?language=en`,
    isXml: true,
    validator: (text) => typeof text === 'string' && (text.includes('<workzag-jobs>') || text.includes('<position>'))
  },
  {
    ats: 'teamtailor',
    regex: /([\w-]+)\.teamtailor\.com/i,
    testUrl: (slug) => `https://${encodeURIComponent(slug)}.teamtailor.com/jobs.json`,
    validator: (data) => Array.isArray(data?.items) || Array.isArray(data?.data)
  }
];

/**
 * Validates a candidate slug for a specific ATS provider via live HTTP check.
 */
async function verifyAtsSlug(ats, slug) {
  if (!slug || !ats) return false;
  const config = ATS_PATTERNS.find(p => p.ats === ats);
  if (!config) return false;

  try {
    const url = config.testUrl(slug);
    const host = new URL(url).host;
    await rateLimitHost(host);

    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const options = {
      headers: {
        'Accept': config.isXml ? 'application/xml, text/xml, */*' : 'application/json',
        'User-Agent': UA
      },
      signal: AbortSignal.timeout(7000)
    };

    if (config.postBody) {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(config.postBody(slug));
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      // For Personio, if .de returned 404, fallback to .com
      if (ats === 'personio' && res.status === 404) {
        const comUrl = `https://${encodeURIComponent(slug)}.jobs.personio.com/xml?language=en`;
        await rateLimitHost(new URL(comUrl).host);
        const comRes = await fetch(comUrl, options);
        if (comRes.ok) {
          const comText = await comRes.text();
          return config.validator(comText);
        }
      }

      // For Workable, fallback to public jobs.md feed if API is rate-limited (429) or non-ok
      if (ats === 'workable') {
        const mdUrl = `https://apply.workable.com/${encodeURIComponent(slug)}/jobs.md`;
        const mdRes = await fetch(mdUrl, {
          headers: { 'User-Agent': UA, 'Accept': 'text/markdown, text/plain, */*' },
          signal: AbortSignal.timeout(6000),
          redirect: 'follow'
        });
        if (mdRes.ok) {
          const mdText = await mdRes.text();
          if (mdText.includes('[View](') || mdText.includes('# ') || mdText.includes('Powered by [Workable]')) {
            return true;
          }
        }
      }

      return false;
    }

    if (config.isXml) {
      const text = await res.text();
      return config.validator(text);
    }

    const data = await res.json();
    return config.validator(data);
  } catch (_) {
    return false;
  }
}

/**
 * Detects ATS from a direct career or job posting URL.
 */
async function detectFromUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  for (const pattern of ATS_PATTERNS) {
    const match = urlStr.match(pattern.regex);
    if (match && match[1]) {
      const candidateSlug = match[1].toLowerCase().trim();
      // Skip generic reserved words
      if (['jobs', 'careers', 'apply', 'view', 'embed', 'api'].includes(candidateSlug)) continue;

      const isValid = await verifyAtsSlug(pattern.ats, candidateSlug);
      if (isValid) {
        return {
          detected: true,
          ats: pattern.ats,
          slug: candidateSlug,
          sourceUrl: urlStr,
          method: 'direct_url'
        };
      }
    }
  }

  return null;
}

/**
 * Sniffs HTML content of a company careers page to find embedded ATS links or iframes.
 */
async function sniffPageForAts(targetUrl) {
  try {
    const isSafe = await isPublicWebUrl(targetUrl);
    if (!isSafe) {
      console.warn(`[AtsDetector] SSRF guard blocked unsafe target URL: ${targetUrl}`);
      return null;
    }

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    // First check final redirect URL
    const finalUrl = res.url || targetUrl;
    const directMatch = await detectFromUrl(finalUrl);
    if (directMatch) return directMatch;

    const html = await res.text();

    // Check patterns in HTML
    for (const pattern of ATS_PATTERNS) {
      const matches = html.matchAll(new RegExp(pattern.regex.source, 'gi'));
      for (const m of matches) {
        if (m && m[1]) {
          const candidateSlug = m[1].toLowerCase().trim();
          if (['jobs', 'careers', 'apply', 'view', 'embed', 'api'].includes(candidateSlug)) continue;

          const isValid = await verifyAtsSlug(pattern.ats, candidateSlug);
          if (isValid) {
            return {
              detected: true,
              ats: pattern.ats,
              slug: candidateSlug,
              sourceUrl: targetUrl,
              method: 'html_sniff'
            };
          }
        }
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Comprehensive company ATS detector.
 *
 * @param {string} companyName - Display name
 * @param {string} domainOrUrl - e.g. "razorpay.com", "https://careers.swiggy.com"
 * @returns {Promise<Object>} Detection result
 */
async function detectCompanyAts(companyName, domainOrUrl) {
  if (!domainOrUrl) {
    return { detected: false, error: 'No URL or domain provided' };
  }

  let formattedUrl = domainOrUrl.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  // 1. Direct URL check
  const directMatch = await detectFromUrl(formattedUrl);
  if (directMatch) return directMatch;

  // 2. Sniff primary target URL
  const sniffTarget = await sniffPageForAts(formattedUrl);
  if (sniffTarget) return sniffTarget;

  // 3. Try standard career page subpaths: /careers, /jobs, /join-us
  try {
    const parsed = new URL(formattedUrl);
    const careerPaths = ['/careers', '/jobs', '/about/careers', '/join-us'];
    for (const p of careerPaths) {
      const subUrl = `${parsed.origin}${p}`;
      const subMatch = await sniffPageForAts(subUrl);
      if (subMatch) return subMatch;
    }
  } catch (_) {}

  return {
    detected: false,
    company: companyName,
    url: formattedUrl
  };
}

module.exports = {
  detectCompanyAts,
  detectFromUrl,
  verifyAtsSlug,
  ATS_PATTERNS
};

