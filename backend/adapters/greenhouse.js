/**
 * Greenhouse Job Board API Adapter
 * Official Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://boards-api.greenhouse.io/v1/boards';
const HOST = 'boards-api.greenhouse.io';

/**
 * Normalizes a raw Greenhouse job item.
 *
 * @param {Object} rawJob - Raw job object from Greenhouse API
 * @param {string} companyName - Display name of the company
 * @returns {Object} Normalized job object
 */
function normalizeGreenhouseJob(rawJob, companyName) {
  const sourceJobId = String(rawJob.id || '').trim();
  const title = (rawJob.title || 'Untitled Position').trim();
  const rawLoc = (rawJob.location && rawJob.location.name) 
    ? rawJob.location.name.trim() 
    : 'Unspecified';

  const locNorm = normalizeLocation(rawLoc, { title });
  const descriptionHtml = rawJob.content || '';
  const applyUrl = (rawJob.absolute_url || '').trim();
  const updatedAt = rawJob.updated_at ? new Date(rawJob.updated_at) : new Date();
  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'greenhouse',
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
 * Fetches and normalizes all public jobs for a given Greenhouse slug.
 *
 * @param {string} slug - The Greenhouse company board slug
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchGreenhouseJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  await rateLimitHost(HOST);

  const url = `${BASE_URL}/${encodeURIComponent(slug.trim())}/jobs?content=true`;

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
        error: `Greenhouse board not found (HTTP 404) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `Greenhouse rate limit exceeded (HTTP 429) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Greenhouse API error (HTTP ${response.status} ${response.statusText}) for slug: "${slug}"`,
        jobs: []
      };
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.jobs)) {
      return {
        success: false,
        error: `Unexpected response payload from Greenhouse for slug: "${slug}"`,
        jobs: []
      };
    }

    const normalizedJobs = data.jobs
      .filter((item) => item && item.id && item.absolute_url)
      .map((item) => normalizeGreenhouseJob(item, companyName));

    return {
      success: true,
      status: response.status,
      jobs: normalizedJobs
    };
  } catch (err) {
    return {
      success: false,
      error: `Network or parsing error for Greenhouse slug "${slug}": ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchGreenhouseJobs,
  normalizeGreenhouseJob
};
