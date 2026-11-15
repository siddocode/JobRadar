/**
 * Personio Job Board API Adapter
 * Official Public Unauthenticated XML Feed: GET https://{slug}.jobs.personio.de/xml?language=en
 * Fallback: GET https://{slug}.jobs.personio.com/xml?language=en
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');

/**
 * Extracts inner text or CDATA from an XML tag.
 */
function extractXmlTag(xmlBlock, tagName) {
  if (!xmlBlock) return '';
  const regex = new RegExp(`<${tagName}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tagName}>`, 'i');
  const match = xmlBlock.match(regex);
  if (!match) return '';
  return (match[1] !== undefined ? match[1] : match[2] || '').trim();
}

/**
 * Parses all <position> blocks from a Personio XML string.
 *
 * @param {string} xmlString - Raw XML text from Personio feed
 * @returns {Array<Object>} Extracted raw position objects
 */
function parsePersonioXml(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return [];

  const positions = [];
  const positionMatches = xmlString.matchAll(/<position>([\s\S]*?)<\/position>/gi);

  for (const match of positionMatches) {
    const block = match[1];
    const id = extractXmlTag(block, 'id');
    const name = extractXmlTag(block, 'name');
    if (!id || !name) continue;

    const primaryOffice = extractXmlTag(block, 'office');
    
    // Extract additional offices if present
    const additionalOffices = [];
    const addOfficesBlock = block.match(/<additionalOffices>([\s\S]*?)<\/additionalOffices>/i);
    if (addOfficesBlock) {
      const officeMatches = addOfficesBlock[1].matchAll(/<office>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/office>/gi);
      for (const om of officeMatches) {
        const oVal = (om[1] !== undefined ? om[1] : om[2] || '').trim();
        if (oVal && oVal !== primaryOffice) additionalOffices.push(oVal);
      }
    }

    // Combine office strings for complete location context
    const allOffices = [primaryOffice, ...additionalOffices].filter(Boolean);
    const officeStr = allOffices.join('; ');

    const department = extractXmlTag(block, 'department');
    const employmentType = extractXmlTag(block, 'employmentType');
    const seniority = extractXmlTag(block, 'seniority');
    const schedule = extractXmlTag(block, 'schedule');
    const createdAtStr = extractXmlTag(block, 'createdAt');

    // Extract structured job descriptions and merge into HTML
    const descriptions = [];
    const descMatches = block.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/gi);
    for (const dm of descMatches) {
      const dBlock = dm[1];
      const dTitle = extractXmlTag(dBlock, 'name');
      const dValue = extractXmlTag(dBlock, 'value');
      if (dTitle || dValue) {
        descriptions.push(`<div>${dTitle ? `<h3>${dTitle}</h3>` : ''}${dValue || ''}</div>`);
      }
    }
    const descriptionHtml = descriptions.join('\n');

    positions.push({
      id,
      name,
      office: officeStr,
      department,
      employmentType,
      seniority,
      schedule,
      descriptionHtml,
      createdAt: createdAtStr ? new Date(createdAtStr) : new Date()
    });
  }

  return positions;
}

/**
 * Normalizes a raw Personio position into JobRadar schema.
 *
 * @param {Object} rawJob - Parsed position object
 * @param {string} companyName - Display name of the company
 * @param {string} slug - Personio company slug
 * @param {string} domain - Domain base used (.de or .com)
 * @returns {Object} Normalized job object
 */
function normalizePersonioJob(rawJob, companyName, slug, domain = 'jobs.personio.de') {
  const sourceJobId = String(rawJob.id || '').trim();
  const title = (rawJob.name || 'Untitled Position').trim();

  // Location handling
  const rawLoc = rawJob.office || 'Unspecified';
  const isRemote = /remote|home\s*office|anywhere/i.test(rawLoc) || /remote/i.test(title);
  const locNorm = normalizeLocation(rawLoc, {
    title,
    workplaceType: isRemote ? 'remote' : undefined
  });

  const applyUrl = `https://${encodeURIComponent(slug)}.${domain}/job/${sourceJobId}`;
  const updatedAt = rawJob.createdAt instanceof Date && !isNaN(rawJob.createdAt.getTime())
    ? rawJob.createdAt
    : new Date();

  const fingerprint = generateFingerprint(companyName, title, locNorm.city);

  return {
    source: 'personio',
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
    descriptionHtml: rawJob.descriptionHtml || '',
    applyUrl,
    updatedAt
  };
}

/**
 * Fetches and normalizes all public jobs for a given Personio slug.
 *
 * @param {string} slug - The Personio company slug (e.g. "personio" or "clark")
 * @param {string} companyName - Display name of the company
 * @returns {Promise<{ success: boolean, jobs: Array, status?: number, error?: string }>}
 */
async function fetchPersonioJobs(slug, companyName) {
  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      error: `Invalid or missing slug: "${slug}"`,
      jobs: []
    };
  }

  const cleanSlug = slug.trim().toLowerCase();
  
  // Try .de endpoint first, then .com fallback
  const domainsToTry = ['jobs.personio.de', 'jobs.personio.com'];
  if (cleanSlug.includes('.')) {
    // Custom domain provided
    domainsToTry.unshift(cleanSlug);
  }

  let lastStatus = 0;
  let lastError = null;

  for (const domain of domainsToTry) {
    const isCustom = domain === cleanSlug;
    const host = isCustom ? domain : `${cleanSlug}.${domain}`;
    const url = isCustom
      ? `https://${domain}/xml?language=en`
      : `https://${cleanSlug}.${domain}/xml?language=en`;

    await rateLimitHost(host);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/xml, text/xml, */*',
          'User-Agent': 'JobRadar/2.0'
        }
      });

      clearTimeout(timeout);
      lastStatus = response.status;

      if (response.status === 404) {
        continue; // Try next domain variant
      }

      if (response.status === 429) {
        return {
          success: false,
          status: 429,
          error: `Personio rate limit exceeded (HTTP 429) for slug: "${cleanSlug}"`,
          jobs: []
        };
      }

      if (!response.ok) {
        lastError = `Personio request failed with HTTP ${response.status}`;
        continue;
      }

      const xmlText = await response.text();
      if (!xmlText || !xmlText.includes('<workzag-jobs>')) {
        lastError = `Response is not a valid Personio job feed`;
        continue;
      }

      const rawPositions = parsePersonioXml(xmlText);
      const jobs = rawPositions.map(raw => normalizePersonioJob(raw, companyName, cleanSlug, domain));

      return {
        success: true,
        status: 200,
        jobs
      };
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      lastError = isTimeout
        ? `Request timed out after 15000ms for slug: "${cleanSlug}"`
        : `Network error: ${err.message}`;
    }
  }

  return {
    success: false,
    status: lastStatus || 500,
    error: lastError || `Personio board not found (HTTP 404) for slug: "${cleanSlug}"`,
    jobs: []
  };
}

module.exports = {
  fetchPersonioJobs,
  normalizePersonioJob,
  parsePersonioXml
};
