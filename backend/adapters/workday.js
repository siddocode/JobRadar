/**
 * Workday Candidate Experience Site (CXS) API Adapter
 * Official CXS Endpoint: POST https://{host}/wday/cxs/{tenant}/{site}/jobs
 * Supports enterprise companies like Visa, Mastercard, and other Fortune 500s.
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

/**
 * Normalizes a raw Workday job posting.
 *
 * @param {Object} rawJob - Raw job posting object from Workday CXS
 * @param {string} companyName - Display name of the company
 * @param {string} host - Hostname e.g. "visa.wd5.myworkdayjobs.com"
 * @param {string} site - Career site identifier e.g. "CorporateCareers"
 * @returns {Object} Normalized job object
 */
function normalizeWorkdayJob(rawJob, companyName, host, site = '') {
  const sourceJobId = String(
    (rawJob.bulletFields && rawJob.bulletFields[0]) ||
    rawJob.externalPath ||
    rawJob.title
  ).trim();

  const title = (rawJob.title || 'Untitled Position').trim();
  const rawLoc = rawJob.locationsText || 'Unspecified';

  const isRemote = /remote/i.test(rawLoc) || /remote/i.test(title);
  const isHybrid = /hybrid/i.test(rawLoc) || /hybrid/i.test(title);

  // Workday requires /en-US/{site} prefix in external URLs.
  // Without it, Workday returns 404 (This webpage is not available).
  let extPath = rawJob.externalPath || '';
  if (!extPath.startsWith('/')) extPath = `/${extPath}`;

  const siteSegment = site ? `/en-US/${site}` : '';
  const applyUrl = `https://${host}${siteSegment}${extPath}`;

  const locNorm = normalizeLocation(rawLoc, {
    workplaceType: isRemote ? 'remote' : (isHybrid ? 'hybrid' : null),
    isRemote,
    title,
    applyUrl
  });

  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'workday',
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
    updatedAt: new Date()
  };
}

/**
 * Fetches and normalizes public jobs for a Workday company.
 *
 * @param {string|Object} config - Either a slug ("host/tenant/site") or config object { host, tenant, site }
 * @param {string} companyName - Display name of the company
 * @param {number} maxPages - Max pages of 20 to fetch (default: 5 = 100 jobs)
 * @returns {Promise<{ success: boolean, jobs: Array, error?: string }>}
 */
async function fetchWorkdayJobs(config, companyName, maxPages = 5) {
  let host = '';
  let tenant = '';
  let site = '';

  if (typeof config === 'object' && config !== null) {
    host = config.host || '';
    tenant = config.tenant || '';
    site = config.site || '';
  } else if (typeof config === 'string') {
    // format: host/tenant/site or host:tenant:site
    const parts = config.replace('https://', '').split(/[/:]/).filter(Boolean);
    if (parts.length >= 3) {
      host = parts[0];
      tenant = parts[1];
      site = parts[2];
    }
  }

  if (!host || !tenant || !site) {
    return {
      success: false,
      error: `Invalid Workday config for "${companyName}": host="${host}", tenant="${tenant}", site="${site}"`,
      jobs: []
    };
  }

  await rateLimitHost(host);

  const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  const allJobs = [];

  try {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * 20;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit: 20,
          offset,
          searchText: ''
        })
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (page === 0) {
          return {
            success: false,
            error: `Workday API returned HTTP ${response.status} for "${companyName}" (${endpoint})`,
            jobs: []
          };
        }
        break; // Partial pagination success
      }

      const data = await response.json();
      const postings = data.jobPostings || [];

      if (postings.length === 0) break;

      for (const raw of postings) {
        allJobs.push(normalizeWorkdayJob(raw, companyName, host, site));
      }

      // If we reached total available, stop paginating
      if (allJobs.length >= (data.total || 0)) break;
    }

    return {
      success: true,
      jobs: allJobs
    };
  } catch (err) {
    return {
      success: allJobs.length > 0,
      error: `Workday error for "${companyName}": ${err.message}`,
      jobs: allJobs
    };
  }
}

module.exports = {
  fetchWorkdayJobs,
  normalizeWorkdayJob
};
