/**
 * Amazon Jobs API Adapter
 * Official Endpoint: GET https://amazon.jobs/en/search.json
 * Fetches verified public jobs directly from Amazon's search API.
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://amazon.jobs/en/search.json';
const HOST = 'amazon.jobs';

/**
 * Normalizes a raw Amazon job object.
 *
 * @param {Object} rawJob - Raw job object from Amazon Jobs search API
 * @param {string} companyName - Display name e.g. "Amazon"
 * @returns {Object} Normalized job object
 */
function normalizeAmazonJob(rawJob, companyName = 'Amazon') {
  const sourceJobId = String(rawJob.id_icims || rawJob.id || '').trim();
  const title = (rawJob.title || 'Untitled Position').trim();
  const rawLoc = rawJob.normalized_location || rawJob.location || 'Unspecified';

  const isRemote = /remote/i.test(rawLoc) || /remote/i.test(title);
  const isHybrid = /hybrid/i.test(rawLoc) || /hybrid/i.test(title);

  const locNorm = normalizeLocation(rawLoc, {
    workplaceType: isRemote ? 'remote' : (isHybrid ? 'hybrid' : null),
    isRemote,
    title
  });

  // If Amazon gave a specific city or country, ensure it's captured
  const city = locNorm.city || rawJob.city || null;
  const country = locNorm.country || (rawJob.country_code === 'IND' ? 'India' : (rawJob.country_code === 'USA' ? 'United States' : rawJob.country_code));

  const applyUrl = rawJob.url_next_step || (rawJob.job_path ? `https://amazon.jobs${rawJob.job_path}` : 'https://amazon.jobs');
  const fingerprint = generateFingerprint(companyName, title, city);

  let updatedAt = new Date();
  if (rawJob.posted_date) {
    const parsed = new Date(rawJob.posted_date);
    if (!isNaN(parsed.getTime())) updatedAt = parsed;
  }

  return {
    source: 'amazon',
    sourceJobId,
    company: companyName,
    title,
    location: locNorm.locationRaw,
    locationRaw: locNorm.locationRaw,
    city,
    state: locNorm.state,
    country,
    workMode: locNorm.workMode,
    fingerprint,
    descriptionHtml: rawJob.description || '',
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes jobs from Amazon's search API.
 *
 * @param {string|Object} query - Optional query params or filters
 * @param {string} companyName - Display name (default: "Amazon")
 * @param {number} maxResults - Max jobs to retrieve (default: 100)
 * @returns {Promise<{ success: boolean, jobs: Array, error?: string }>}
 */
async function fetchAmazonJobs(query = {}, companyName = 'Amazon', maxResults = 100) {
  await rateLimitHost(HOST);

  const allJobs = [];
  const limit = Math.min(maxResults, 100);

  try {
    // Fetch page 1 (100 jobs)
    const url = `${BASE_URL}?result_limit=${limit}&offset=0&sort=recent`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Amazon Jobs API returned HTTP ${response.status} (${response.statusText})`,
        jobs: []
      };
    }

    const data = await response.json();
    const rawJobs = data.jobs || [];

    for (const raw of rawJobs) {
      allJobs.push(normalizeAmazonJob(raw, companyName));
    }

    // Also fetch 100 India-focused jobs if worldwide returned few India roles
    const indiaCount = allJobs.filter(j => j.country === 'India' || /india/i.test(j.location)).length;
    if (indiaCount < 20) {
      const indiaUrl = `${BASE_URL}?country=IND&result_limit=100&offset=0&sort=recent`;
      const indController = new AbortController();
      const indTimeout = setTimeout(() => indController.abort(), 15000);

      const indRes = await fetch(indiaUrl, {
        signal: indController.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      clearTimeout(indTimeout);

      if (indRes.ok) {
        const indData = await indRes.json();
        const indJobs = indData.jobs || [];
        const existingIds = new Set(allJobs.map(j => j.sourceJobId));
        for (const raw of indJobs) {
          const id = String(raw.id_icims || raw.id || '');
          if (!existingIds.has(id)) {
            allJobs.push(normalizeAmazonJob(raw, companyName));
            existingIds.add(id);
          }
        }
      }
    }

    return {
      success: true,
      jobs: allJobs
    };
  } catch (err) {
    return {
      success: allJobs.length > 0,
      error: `Amazon Jobs error: ${err.message}`,
      jobs: allJobs
    };
  }
}

module.exports = {
  fetchAmazonJobs,
  normalizeAmazonJob
};
