/**
 * Teamtailor Job Board API Adapter
 * Official Public Unauthenticated JSON Feed: GET https://{slug}.teamtailor.com/jobs.json
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

/**
 * Extracts location string and remote indicators from Teamtailor job item.
 */
function extractTeamtailorLocation(rawItem) {
  const jobposting = rawItem._jobposting || {};
  const locations = [];
  let isTelecommute = jobposting.jobLocationType === 'TELECOMMUTE';

  const jobLocations = Array.isArray(jobposting.jobLocation)
    ? jobposting.jobLocation
    : (jobposting.jobLocation ? [jobposting.jobLocation] : []);

  for (const loc of jobLocations) {
    const addr = loc.address || loc;
    const parts = [
      addr.addressLocality,
      addr.addressRegion,
      addr.addressCountry
    ].filter(Boolean);

    if (parts.length > 0) {
      locations.push(parts.join(', '));
    }
  }

  // Fallback to tags or text if structured location is missing
  if (locations.length === 0) {
    if (rawItem.tags && Array.isArray(rawItem.tags)) {
      const locTag = rawItem.tags.find(t => typeof t === 'string' && /location:/i.test(t));
      if (locTag) locations.push(locTag.replace(/location:\s*/i, '').trim());
    }
  }

  const rawLoc = locations.length > 0 ? locations.join('; ') : 'Unspecified';
  const hasRemoteKeyword = /remote|telecommute|anywhere|work\s*from\s*home/i.test(rawLoc) ||
    /remote/i.test(rawItem.title || '');

  return {
    rawLoc,
    isRemote: isTelecommute || hasRemoteKeyword
  };
}

/**
 * Normalizes a raw Teamtailor job item into JobRadar schema.
 *
 * @param {Object} rawJob - Raw item from jobs.json
 * @param {string} companyName - Display name of the company
 * @param {string} slug - Teamtailor company slug
 * @returns {Object} Normalized job object
 */
function normalizeTeamtailorJob(rawJob, companyName, slug) {
  const sourceJobId = String(
    rawJob.id ||
    rawJob._jobposting?.identifier?.value ||
    rawJob.url ||
    ''
  ).trim();

  const title = (rawJob.title || rawJob._jobposting?.title || 'Untitled Position').trim();
  const { rawLoc, isRemote } = extractTeamtailorLocation(rawJob);

  const locNorm = normalizeLocation(rawLoc, {
    title,
    workplaceType: isRemote ? 'remote' : undefined
  });

  const applyUrl = (rawJob.url || rawJob._jobposting?.url || `https://${slug}.teamtailor.com/jobs/${sourceJobId}`).trim();
  const publishedDate = rawJob.date_published || rawJob._jobposting?.datePosted;
  const updatedAt = publishedDate ? new Date(publishedDate) : new Date();

  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'teamtailor',
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
    descriptionHtml: rawJob.content_html || rawJob._jobposting?.description || '',
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes all public jobs for a given Teamtailor slug.
 *
 * @param {string} slug - The Teamtailor company slug (e.g. "career" or "volumental")
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchTeamtailorJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  const cleanSlug = slug.trim().toLowerCase();
  const isCustomDomain = cleanSlug.includes('.');
  const host = isCustomDomain ? cleanSlug : `${cleanSlug}.teamtailor.com`;
  const url = isCustomDomain
    ? `https://${cleanSlug}/jobs.json`
    : `https://${cleanSlug}.teamtailor.com/jobs.json`;

  await rateLimitHost(host);

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
        error: `Teamtailor board not found (HTTP 404) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        error: `Teamtailor rate limit exceeded (HTTP 429) for slug: "${cleanSlug}"`,
        jobs: []
      };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Teamtailor request failed with HTTP ${response.status}`,
        jobs: []
      };
    }

    const data = await response.json();
    const rawItems = Array.isArray(data.items)
      ? data.items
      : (Array.isArray(data.data) ? data.data : []);

    const jobs = rawItems
      .filter(item => item && (item.id || item.url || item.title))
      .map(item => normalizeTeamtailorJob(item, companyName, cleanSlug));

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
  fetchTeamtailorJobs,
  normalizeTeamtailorJob,
  extractTeamtailorLocation
};
