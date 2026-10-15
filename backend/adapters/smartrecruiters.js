/**
 * SmartRecruiters Posting API Adapter
 * Official Endpoint: GET https://api.smartrecruiters.com/v1/companies/{slug}/postings
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://api.smartrecruiters.com/v1/companies';
const HOST = 'api.smartrecruiters.com';

/**
 * Normalizes a raw SmartRecruiters job item.
 *
 * @param {Object} rawJob - Raw job object from SmartRecruiters API
 * @param {string} companyName - Display name of the company
 * @param {string} slug - Company identifier
 * @returns {Object} Normalized job object
 */
function normalizeSmartRecruitersJob(rawJob, companyName, slug) {
  const sourceJobId = String(rawJob.id || '').trim();
  const title = (rawJob.name || 'Untitled Position').trim();

  let rawLoc = (rawJob.location && rawJob.location.fullLocation) 
    ? rawJob.location.fullLocation.trim()
    : 'Unspecified';

  if (rawLoc === 'Unspecified' && rawJob.location) {
    const parts = [rawJob.location.city, rawJob.location.region, rawJob.location.country].filter(Boolean);
    if (parts.length > 0) {
      rawLoc = parts.join(', ');
    }
  }

  const isRemote = rawJob.location ? (rawJob.location.remote === true) : false;
  const isHybrid = rawJob.location ? (rawJob.location.hybrid === true) : false;

  const locNorm = normalizeLocation(rawLoc, {
    workplaceType: isRemote ? 'remote' : (isHybrid ? 'hybrid' : null),
    isRemote,
    title
  });

  const applyUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${sourceJobId}`;
  const updatedAt = rawJob.releasedDate ? new Date(rawJob.releasedDate) : new Date();
  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'smartrecruiters',
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
    descriptionHtml: '',
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes all public jobs for a given SmartRecruiters company slug.
 *
 * @param {string} slug - The SmartRecruiters company identifier
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchSmartRecruitersJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  await rateLimitHost(HOST);

  const url = `${BASE_URL}/${encodeURIComponent(slug.trim())}/postings?limit=100`;

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
        error: `SmartRecruiters company not found (HTTP 404) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `SmartRecruiters rate limit exceeded (HTTP 429) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `SmartRecruiters API error (HTTP ${response.status} ${response.statusText}) for slug: "${slug}"`,
        jobs: []
      };
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.content)) {
      return {
        success: false,
        error: `Unexpected response payload from SmartRecruiters for slug: "${slug}"`,
        jobs: []
      };
    }

    const normalizedJobs = data.content
      .filter((item) => item && item.id)
      .map((item) => normalizeSmartRecruitersJob(item, companyName, slug));

    return {
      success: true,
      status: response.status,
      jobs: normalizedJobs
    };
  } catch (err) {
    return {
      success: false,
      error: `Network or parsing error for SmartRecruiters slug "${slug}": ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchSmartRecruitersJobs,
  normalizeSmartRecruitersJob
};
