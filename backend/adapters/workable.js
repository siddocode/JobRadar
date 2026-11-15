/**
 * Workable Job Board API Adapter
 * Official Widget/Public Endpoint: POST https://apply.workable.com/api/v3/accounts/{slug}/jobs
 * Fallback: GET https://apply.workable.com/{slug}/jobs.md
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://apply.workable.com/api/v3/accounts';
const HOST = 'apply.workable.com';

/**
 * Normalizes a raw Workable job item.
 *
 * @param {Object} rawJob - Raw job object from Workable API or parsed Markdown
 * @param {string} companyName - Display name of the company
 * @param {string} slug - Company account slug
 * @returns {Object} Normalized job object
 */
function normalizeWorkableJob(rawJob, companyName, slug) {
  const sourceJobId = String(rawJob.shortcode || rawJob.id || '').trim();
  const title = (rawJob.title || 'Untitled Position').trim();

  // Extract location components
  const locObj = rawJob.location || {};
  const city = locObj.city || '';
  const state = locObj.region || '';
  const country = locObj.country || locObj.countryCode || '';
  const rawLocParts = [city, state, country].filter(Boolean);
  const rawLoc = rawJob.locationRaw || (rawLocParts.length > 0 ? rawLocParts.join(', ') : (rawJob.remote ? 'Remote' : 'Unspecified'));

  const locNorm = normalizeLocation(rawLoc, {
    title,
    workplaceType: rawJob.workplace || (rawJob.remote ? 'remote' : undefined)
  });

  const shortcode = rawJob.shortcode || rawJob.id;
  const applyUrl = rawJob.url || `https://apply.workable.com/${encodeURIComponent(slug)}/j/${shortcode}/`;
  const updatedAt = rawJob.published ? new Date(rawJob.published) : new Date();
  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'workable',
    sourceJobId,
    company: companyName,
    title,
    location: locNorm.locationRaw,
    locationRaw: locNorm.locationRaw,
    city: locNorm.city,
    state: locNorm.state,
    country: locNorm.country,
    workMode: locNorm.workMode,
    fingerprint,
    descriptionHtml: rawJob.description || '',
    applyUrl,
    updatedAt
  };
}

/**
 * Fallback parser for Workable public Markdown feed.
 */
async function fetchWorkableMarkdown(slug, companyName) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const urlsToTry = [
    `https://apply.workable.com/${encodeURIComponent(slug)}/jobs.md?workplace=on_site&workplace=hybrid&workplace=remote`,
    `https://apply.workable.com/${encodeURIComponent(slug)}/jobs.md`,
    `https://apply.workable.com/${encodeURIComponent(slug)}/jobs.md?department=Engineering&department=Product+%26+Design&department=Data+%26+Analytics`
  ];

  for (const mdUrl of urlsToTry) {
    try {
      const mdRes = await fetch(mdUrl, {
        headers: { 'User-Agent': UA, 'Accept': 'text/markdown, text/plain, */*' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      if (!mdRes.ok) continue;

      const mdText = await mdRes.text();
      const lines = mdText.split('\n');
      const parsedJobs = [];

      for (const line of lines) {
        if (!line.includes('[View](')) continue;
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length < 3) continue;

        const title = cols[0];
        const lastCol = cols[cols.length - 1];
        const match = lastCol.match(/jobs\/view\/([^.]+)\.md/);
        if (!match) continue;

        const shortcode = match[1];
        let loc = cols.find((c, i) => i > 0 && i < cols.length - 1 && /india|bengaluru|bangalore|pune|mumbai|hyderabad|delhi|gurgaon|gurugram|noida|chennai|kolkata|remote|hybrid|onsite|united states|uk|germany|netherlands|singapore/i.test(c));
        if (!loc && cols.length >= 4) loc = cols[2];
        if (!loc && cols.length >= 3) loc = cols[1];

        parsedJobs.push(normalizeWorkableJob({
          title,
          department: cols[1] || 'General',
          locationRaw: loc || 'Unspecified',
          employment_type: cols.find(c => /full-time|part-time|contract|internship/i.test(c)) || '',
          shortcode,
          id: shortcode,
          url: `https://apply.workable.com/${encodeURIComponent(slug)}/j/${shortcode}/`
        }, companyName, slug));
      }

      if (parsedJobs.length > 0) {
        return { success: true, status: 200, jobs: parsedJobs };
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Fetches and normalizes all public jobs for a given Workable slug with pagination.
 *
 * @param {string} slug - The Workable company board slug
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchWorkableJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  const cleanSlug = slug.trim().toLowerCase();
  await rateLimitHost(HOST);

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const url = `${BASE_URL}/${encodeURIComponent(cleanSlug)}/jobs`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': UA
      },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] })
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      // Check markdown fallback before returning 404
      const mdFallback = await fetchWorkableMarkdown(cleanSlug, companyName);
      if (mdFallback) return mdFallback;

      return {
        success: false,
        status: 404,
        error: `Workable account not found (HTTP 404) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      // Check markdown fallback on 429 rate limit
      const mdFallback = await fetchWorkableMarkdown(cleanSlug, companyName);
      if (mdFallback) return mdFallback;

      return {
        success: false,
        status: 429,
        error: `Workable rate limit exceeded (HTTP 429) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      const mdFallback = await fetchWorkableMarkdown(cleanSlug, companyName);
      if (mdFallback) return mdFallback;

      return {
        success: false,
        status: response.status,
        error: `Workable request failed with HTTP ${response.status}`,
        jobs: []
      };
    }

    const data = await response.json();
    let rawJobs = Array.isArray(data.results) ? [...data.results] : [];

    // Paginate through nextPage token if available (up to 10 pages)
    let token = data.nextPage;
    let pageCount = 0;
    const MAX_PAGES = 10;

    while (token && pageCount < MAX_PAGES) {
      pageCount++;
      await rateLimitHost(HOST);
      try {
        const nextRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'JobRadar/2.0'
          },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(8000)
        });

        if (nextRes.ok) {
          const nextData = await nextRes.json();
          if (Array.isArray(nextData.results)) {
            rawJobs.push(...nextData.results);
          }
          token = nextData.nextPage;
        } else {
          break;
        }
      } catch (_) {
        break;
      }
    }

    const jobs = rawJobs
      .filter(j => j && (j.shortcode || j.id))
      .map(rawJob => normalizeWorkableJob(rawJob, companyName, cleanSlug));

    return {
      success: true,
      status: 200,
      jobs
    };
  } catch (err) {
    // Attempt markdown fallback on error / timeout
    const mdFallback = await fetchWorkableMarkdown(cleanSlug, companyName);
    if (mdFallback) return mdFallback;

    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      error: isTimeout
        ? `Request timed out after 15000ms for slug: "${cleanSlug}"`
        : `Network error: ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchWorkableJobs,
  normalizeWorkableJob,
  fetchWorkableMarkdown
};
