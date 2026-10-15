/**
 * Adzuna India Job Search API Adapter (Optional)
 * Activated only if ADZUNA_APP_ID and ADZUNA_APP_KEY are set in environment.
 * 
 * Terms & Constraints:
 * - Attribution: Every job from Adzuna must attribute "Adzuna" with link to adzuna domain.
 * - Rate Limits: 25 requests/min on standard free tier.
 * - Storage: Adzuna results are stored with source="adzuna". Cross-source deduplication
 *   strictly prefers direct ATS records over Adzuna records.
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const BASE_URL = 'https://api.adzuna.com/v1/api/jobs/in/search';
const HOST = 'api.adzuna.com';

/**
 * Normalizes an Adzuna job item into the standard format.
 *
 * @param {Object} rawJob - Adzuna raw job object
 * @returns {Object} Normalized job object
 */
function normalizeAdzunaJob(rawJob) {
  const sourceJobId = String(rawJob.id || '').trim();
  const title = (rawJob.title || 'Untitled Position').trim();
  const companyName = (rawJob.company && rawJob.company.display_name)
    ? rawJob.company.display_name.trim()
    : 'Unknown Company';

  const rawLoc = (rawJob.location && rawJob.location.display_name)
    ? rawJob.location.display_name.trim()
    : 'India';

  const locNorm = normalizeLocation(rawLoc, { title });
  const descriptionHtml = rawJob.description || '';
  const applyUrl = (rawJob.redirect_url || '').trim();
  const updatedAt = rawJob.created ? new Date(rawJob.created) : new Date();
  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'adzuna',
    sourceJobId,
    company: companyName,
    title,
    location: locNorm.locationRaw,
    locationRaw: locNorm.locationRaw,
    city: locNorm.city,
    state: locNorm.state,
    country: locNorm.country || 'India',
    workMode: locNorm.workMode,
    fingerprint,
    descriptionHtml,
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches jobs from Adzuna India if credentials are provided.
 *
 * @returns {Promise<{ success: boolean, jobs: Array, skipped?: boolean, error?: string }>}
 */
async function fetchAdzunaJobs() {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return {
      success: true,
      skipped: true,
      message: 'ADZUNA_APP_ID and/or ADZUNA_APP_KEY not provided. Skipping Adzuna collection.',
      jobs: []
    };
  }

  await rateLimitHost(HOST);

  const url = `${BASE_URL}/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&results_per_page=50&content-type=application/json`;

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

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Adzuna API error (HTTP ${response.status} ${response.statusText})`,
        jobs: []
      };
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.results)) {
      return {
        success: false,
        error: 'Unexpected response format from Adzuna API',
        jobs: []
      };
    }

    const normalizedJobs = data.results
      .filter((item) => item && item.id && item.redirect_url)
      .map(normalizeAdzunaJob);

    return {
      success: true,
      jobs: normalizedJobs
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error querying Adzuna: ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchAdzunaJobs,
  normalizeAdzunaJob
};
