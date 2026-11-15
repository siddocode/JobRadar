/**
 * Recruitee Job Board API Adapter
 * Official Careers API: GET https://{slug}.recruitee.com/api/offers/
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

/**
 * Normalizes a raw Recruitee job item.
 *
 * @param {Object} rawJob - Raw offer object from Recruitee API
 * @param {string} companyName - Display name of the company
 * @returns {Object} Normalized job object
 */
function normalizeRecruiteeJob(rawJob, companyName) {
  const sourceJobId = String(rawJob.id || rawJob.guid || '').trim();
  const title = (rawJob.title || 'Untitled Position').trim();

  // Location string extraction
  const city = rawJob.city || '';
  const state = rawJob.state_name || rawJob.state_code || '';
  const country = rawJob.country || rawJob.country_code || '';
  const locParts = [city, state, country].filter(Boolean);
  const rawLoc = locParts.length > 0 ? locParts.join(', ') : (rawJob.remote ? 'Remote' : (rawJob.location || 'Unspecified'));

  const workplaceType = rawJob.remote ? 'remote' : (rawJob.hybrid ? 'hybrid' : undefined);
  const locNorm = normalizeLocation(rawLoc, {
    title,
    workplaceType
  });

  const descriptionHtml = [rawJob.description || '', rawJob.requirements || ''].filter(Boolean).join('\n');
  const applyUrl = (rawJob.careers_apply_url || rawJob.careers_url || '').trim();
  const updatedAt = rawJob.published_at || rawJob.updated_at || rawJob.created_at
    ? new Date(rawJob.published_at || rawJob.updated_at || rawJob.created_at)
    : new Date();

  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'recruitee',
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
    descriptionHtml,
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes all public jobs for a given Recruitee slug.
 *
 * @param {string} slug - The Recruitee company slug (e.g., "bunq")
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchRecruiteeJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  const cleanSlug = slug.trim().toLowerCase();
  const host = `${cleanSlug}.recruitee.com`;
  await rateLimitHost(host);

  const url = `https://${cleanSlug}.recruitee.com/api/offers/`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JobRadar/2.0'
      }
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return {
        success: false,
        status: 404,
        error: `Recruitee board not found (HTTP 404) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `Recruitee rate limit exceeded (HTTP 429) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Recruitee request failed with HTTP ${response.status}`,
        jobs: []
      };
    }

    const data = await response.json();
    const rawOffers = Array.isArray(data.offers) ? data.offers : [];

    // Filter open/published offers
    const jobs = rawOffers
      .filter(o => o && o.id && (o.status === 'published' || !o.status))
      .map(rawOffer => normalizeRecruiteeJob(rawOffer, companyName));

    return {
      success: true,
      status: 200,
      jobs
    };
  } catch (err) {
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
  fetchRecruiteeJobs,
  normalizeRecruiteeJob
};

