/**
 * Ashby Job Board API Adapter
 * Official Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{slug}
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://api.ashbyhq.com/posting-api/job-board';
const HOST = 'api.ashbyhq.com';

/**
 * Normalizes a raw Ashby job item.
 *
 * @param {Object} rawJob - Raw job object from Ashby API
 * @param {string} companyName - Display name of the company
 * @returns {Object} Normalized job object
 */
function normalizeAshbyJob(rawJob, companyName) {
  const sourceJobId = String(rawJob.id || '').trim();
  const title = (rawJob.title || 'Untitled Position').trim();

  let rawLoc = (rawJob.location || '').trim();
  if (!rawLoc && rawJob.address && rawJob.address.postalAddress) {
    const parts = [
      rawJob.address.postalAddress.addressLocality,
      rawJob.address.postalAddress.addressRegion,
      rawJob.address.postalAddress.addressCountry
    ].filter(Boolean);
    if (parts.length > 0) {
      rawLoc = parts.join(', ');
    }
  }
  if (!rawLoc) {
    rawLoc = 'Unspecified';
  }

  const locNorm = normalizeLocation(rawLoc, {
    workplaceType: rawJob.workplaceType,
    isRemote: rawJob.isRemote,
    title
  });

  const descriptionHtml = rawJob.descriptionHtml || '';
  const applyUrl = (rawJob.applyUrl || rawJob.jobUrl || '').trim();
  const updatedAt = rawJob.publishedAt ? new Date(rawJob.publishedAt) : new Date();
  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'ashby',
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
 * Fetches and normalizes all public jobs for a given Ashby board slug.
 *
 * @param {string} slug - The Ashby job board slug
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchAshbyJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  await rateLimitHost(HOST);

  const url = `${BASE_URL}/${encodeURIComponent(slug.trim())}`;

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
        error: `Ashby board not found (HTTP 404) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `Ashby rate limit exceeded (HTTP 429) for slug: "${slug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Ashby API error (HTTP ${response.status} ${response.statusText}) for slug: "${slug}"`,
        jobs: []
      };
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.jobs)) {
      return {
        success: false,
        error: `Unexpected response payload from Ashby for slug: "${slug}"`,
        jobs: []
      };
    }

    const normalizedJobs = data.jobs
      .filter((item) => item && item.id && (item.applyUrl || item.jobUrl))
      .map((item) => normalizeAshbyJob(item, companyName));

    return {
      success: true,
      status: response.status,
      jobs: normalizedJobs
    };
  } catch (err) {
    return {
      success: false,
      error: `Network or parsing error for Ashby slug "${slug}": ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchAshbyJobs,
  normalizeAshbyJob
};
