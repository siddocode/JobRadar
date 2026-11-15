/**
 * Workable Job Board API Adapter
 * Official Widget/Public Endpoint: POST https://apply.workable.com/api/v3/accounts/{slug}/jobs
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://apply.workable.com/api/v3/accounts';
const HOST = 'apply.workable.com';

/**
 * Normalizes a raw Workable job item.
 *
 * @param {Object} rawJob - Raw job object from Workable API
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
  const rawLoc = rawLocParts.length > 0 ? rawLocParts.join(', ') : (rawJob.remote ? 'Remote' : 'Unspecified');

  const locNorm = normalizeLocation(rawLoc, {
    title,
    workplaceType: rawJob.workplace || (rawJob.remote ? 'remote' : undefined)
  });

  const shortcode = rawJob.shortcode || rawJob.id;
  const applyUrl = `https://apply.workable.com/${encodeURIComponent(slug)}/j/${shortcode}/`;
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
    descriptionHtml: '', // Populated on-demand or in detailed fetch
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes all public jobs for a given Workable slug.
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
        'User-Agent': 'JobRadar/2.0'
      },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] })
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return {
        success: false,
        status: 404,
        error: `Workable account not found (HTTP 404) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `Workable rate limit exceeded (HTTP 429) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Workable request failed with HTTP ${response.status}`,
        jobs: []
      };
    }

    const data = await response.json();
    const rawJobs = Array.isArray(data.results) ? data.results : [];

    const jobs = rawJobs
      .filter(j => j && (j.shortcode || j.id))
      .map(rawJob => normalizeWorkableJob(rawJob, companyName, cleanSlug));

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
  fetchWorkableJobs,
  normalizeWorkableJob
};

