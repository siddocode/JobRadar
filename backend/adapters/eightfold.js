/**
 * Generic Eightfold.ai ATS Adapter
 * Powers career sites for Netflix, PayPal, Starbucks, Micron, Capital One, etc.
 *
 * Query API:
 *   GET https://{subdomain}.eightfold.ai/api/apply/v2/jobs?domain={domain}&start=0&num={limit}
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

async function fetchEightfoldJobs(config, companyName = 'Company') {
  const domain = (typeof config === 'string' ? config : config.domain || 'netflix.com').trim().toLowerCase();
  const sub = domain.split('.')[0];
  const host = `${sub}.eightfold.ai`;
  const limit = config.limit || 50;

  await rateLimitHost(host);

  const url = `https://${host}/api/apply/v2/jobs?domain=${domain}&start=0&num=${limit}`;
  console.log(`[Eightfold] Fetching jobs for "${companyName}" from ${url}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobRadar/1.0 (Mozilla/5.0; Contact: sid@jobradar.local)',
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        error: `Eightfold HTTP ${res.status}: ${res.statusText}`,
        jobs: []
      };
    }

    const data = await res.json();
    const positions = data.positions || [];
    const normalizedJobs = [];

    for (const pos of positions) {
      if (!pos.name) continue;

      const title = pos.name.trim();
      const sourceJobId = String(pos.id || '').trim();
      const rawLocation = (pos.locations && pos.locations.length > 0) ? pos.locations.join(', ') : 'Remote';
      const locNorm = normalizeLocation(rawLocation, { title });
      const fingerprint = generateFingerprint(companyName, title, locNorm.city);
      const applyUrl = `https://jobs.${domain}/jobs/${sourceJobId}`;
      const descriptionHtml = pos.job_description || '';
      const updatedAt = pos.posted_date ? new Date(pos.posted_date) : new Date();

      normalizedJobs.push({
        source: 'eightfold',
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
      });
    }

    console.log(`[Eightfold] Successfully normalized ${normalizedJobs.length} jobs for "${companyName}".`);
    return {
      success: true,
      error: null,
      jobs: normalizedJobs
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: `Eightfold fetch error: ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchEightfoldJobs
};
