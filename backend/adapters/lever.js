/**
 * Lever Postings API Adapter
 * Official Endpoint: GET https://api.lever.co/v0/postings/{slug}?mode=json
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://api.lever.co/v0/postings';
const HOST = 'api.lever.co';

/**
 * Normalizes a raw Lever job item.
 *
 * @param {Object} rawJob - Raw job object from Lever API
 * @param {string} companyName - Display name of the company
 * @returns {Object} Normalized job object
 */
function normalizeLeverJob(rawJob, companyName) {
  const sourceJobId = String(rawJob.id || '').trim();
  const title = (rawJob.text || 'Untitled Position').trim();
  
  const rawLoc = (rawJob.categories && rawJob.categories.location)
    ? rawJob.categories.location.trim()
    : ((rawJob.categories && Array.isArray(rawJob.categories.allLocations) && rawJob.categories.allLocations[0])
        ? String(rawJob.categories.allLocations[0]).trim()
        : 'Unspecified');

  const locNorm = normalizeLocation(rawLoc, {
    workplaceType: rawJob.workplaceType,
    title
  });

  const descriptionHtml = rawJob.description || rawJob.descriptionBody || '';
  const applyUrl = (rawJob.applyUrl || rawJob.hostedUrl || '').trim();
  const updatedAt = rawJob.createdAt ? new Date(rawJob.createdAt) : new Date();
  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'lever',
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
 * Fetches and normalizes all public jobs for a given Lever slug.
 *
 * @param {string} slug - The Lever company slug
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchLeverJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  await rateLimitHost(HOST);

  const url = `${BASE_URL}/${encodeURIComponent(slug.trim())}?mode=json`;

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
        error: `Lever company not found (HTTP 404) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `Lever rate limit exceeded (HTTP 429) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Lever API error (HTTP ${response.status} ${response.statusText}) for slug: "${slug}"`,
        jobs: []
      };
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return {
        success: false,
        error: `Unexpected response payload from Lever for slug: "${slug}"`,
        jobs: []
      };
    }

    const normalizedJobs = data
      .filter((item) => item && item.id && (item.applyUrl || item.hostedUrl))
      .map((item) => normalizeLeverJob(item, companyName));

    return {
      success: true,
      status: response.status,
      jobs: normalizedJobs
    };
  } catch (err) {
    return {
      success: false,
      error: `Network or parsing error for Lever slug "${slug}": ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchLeverJobs,
  normalizeLeverJob
};
