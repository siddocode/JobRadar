/**
 * Google Careers SSR API Adapter
 * Source: https://www.google.com/about/careers/applications/jobs/results/
 * Extracts and normalizes public Google job postings from the server-rendered application payload.
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

const HOST = 'www.google.com';

/**
 * Normalizes a raw Google Careers job array item.
 *
 * Structure of raw Google item `j`:
 * 0: jobId string e.g. "131666108921848518"
 * 1: title string e.g. "Software Engineer Manager, Google One"
 * 2: applyUrl string
 * 3: [null, responsibilitiesHtml]
 * 4: [null, qualificationsHtml]
 * 7: companyName string e.g. "Google"
 * 9: locations array e.g. [["Bengaluru, Karnataka, India", [...], "Bengaluru", "560016", "KA", "IN"]]
 * 10: [null, fullDescriptionHtml]
 * 12: [timestampSeconds, nanos]
 */
function normalizeGoogleJob(rawJob, companyName = 'Google') {
  const sourceJobId = String(rawJob[0] || '').trim();
  const title = String(rawJob[1] || 'Untitled Position').trim();

  // Extract location
  let rawLoc = 'Unspecified';
  let city = null;
  let country = null;

  if (Array.isArray(rawJob[9]) && rawJob[9].length > 0) {
    const primaryLoc = rawJob[9][0];
    if (Array.isArray(primaryLoc)) {
      rawLoc = primaryLoc[0] || 'Unspecified';
      city = primaryLoc[2] || null;
      country = primaryLoc[5] === 'IN' ? 'India' : (primaryLoc[5] === 'US' ? 'United States' : primaryLoc[5]);
    } else if (typeof primaryLoc === 'string') {
      rawLoc = primaryLoc;
    }
  }

  const isRemote = /remote/i.test(rawLoc) || /remote/i.test(title);
  const isHybrid = /hybrid/i.test(rawLoc) || /hybrid/i.test(title);

  const locNorm = normalizeLocation(rawLoc, {
    workplaceType: isRemote ? 'remote' : (isHybrid ? 'hybrid' : null),
    isRemote,
    title
  });

  const finalCity = locNorm.city || city || null;
  const finalCountry = locNorm.country || country || null;
  const applyUrl = rawJob[2] || `https://www.google.com/about/careers/applications/jobs/results/${sourceJobId}`;
  const fingerprint = generateFingerprint(companyName, title, finalCity);

  let updatedAt = new Date();
  if (Array.isArray(rawJob[12]) && typeof rawJob[12][0] === 'number') {
    updatedAt = new Date(rawJob[12][0] * 1000);
  }

  const descriptionHtml = (rawJob[10] && rawJob[10][1]) || (rawJob[3] && rawJob[3][1]) || '';

  return {
    source: 'google',
    sourceJobId,
    company: companyName,
    title,
    location: locNorm.locationRaw,
    locationRaw: locNorm.locationRaw,
    city: finalCity,
    state: locNorm.state,
    country: finalCountry,
    workMode: locNorm.workMode,
    fingerprint,
    descriptionHtml,
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes Google job postings.
 *
 * @param {string} query - Search query (default: "software")
 * @param {string} companyName - Display name (default: "Google")
 * @returns {Promise<{ success: boolean, jobs: Array, error?: string }>}
 */
async function fetchGoogleJobs(query = 'software', companyName = 'Google') {
  await rateLimitHost(HOST);

  const allJobs = [];
  const urls = [
    `https://www.google.com/about/careers/applications/jobs/results/?q=${encodeURIComponent(query)}&location=India`,
    `https://www.google.com/about/careers/applications/jobs/results/?q=${encodeURIComponent(query)}`
  ];

  const seenIds = new Set();

  try {
    for (const url of urls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });

      clearTimeout(timeout);

      if (!response.ok) continue;

      const html = await response.text();
      const marker = "key: 'ds:1'";
      const startIdx = html.indexOf(marker);
      if (startIdx === -1) continue;

      const dataIdx = html.indexOf('data:', startIdx);
      if (dataIdx === -1) continue;

      const sideIdx = html.indexOf(', sideChannel:', dataIdx);
      if (sideIdx === -1) continue;

      const jsonStr = html.slice(dataIdx + 5, sideIdx).trim();
      const data = JSON.parse(jsonStr);
      const rawPostings = data[0] || [];

      for (const item of rawPostings) {
        if (!Array.isArray(item)) continue;
        const id = String(item[0] || '');
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allJobs.push(normalizeGoogleJob(item, companyName));
        }
      }
    }

    return {
      success: allJobs.length > 0,
      jobs: allJobs
    };
  } catch (err) {
    return {
      success: allJobs.length > 0,
      error: `Google Careers fetch error: ${err.message}`,
      jobs: allJobs
    };
  }
}

module.exports = {
  fetchGoogleJobs,
  normalizeGoogleJob
};
