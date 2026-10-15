const locationAliases = require('../config/locationAliases.json');

/**
 * Normalizes a raw location string and contextual ATS hints into structured metadata.
 *
 * @param {string} rawLocation - Raw location string from ATS
 * @param {Object} [hints] - Optional ATS metadata hints
 * @param {string} [hints.workplaceType] - "remote" | "hybrid" | "onsite" | "unspecified"
 * @param {boolean} [hints.isRemote] - True if remote flag is present
 * @param {string} [hints.title] - Job title for extra remote/hybrid signals
 * @returns {{
 *   locationRaw: string,
 *   city: string | null,
 *   state: string | null,
 *   country: string | null,
 *   workMode: 'onsite' | 'hybrid' | 'remote' | 'unknown'
 * }}
 */
function normalizeLocation(rawLocation, hints = {}) {
  const locationRaw = (typeof rawLocation === 'string' && rawLocation.trim())
    ? rawLocation.trim()
    : 'Unspecified';

  const lowerRaw = locationRaw.toLowerCase();
  const titleLower = String(hints.title || '').toLowerCase();
  const workplaceHint = String(hints.workplaceType || '').toLowerCase();

  // 1. Determine workMode
  let workMode = 'unknown';

  if (
    workplaceHint === 'remote' ||
    hints.isRemote === true ||
    lowerRaw.includes('remote') ||
    titleLower.includes('remote') ||
    lowerRaw.includes('work from home') ||
    lowerRaw.includes('virtual')
  ) {
    // If it also indicates hybrid, prefer hybrid
    if (
      workplaceHint === 'hybrid' ||
      lowerRaw.includes('hybrid') ||
      titleLower.includes('hybrid')
    ) {
      workMode = 'hybrid';
    } else {
      workMode = 'remote';
    }
  } else if (
    workplaceHint === 'hybrid' ||
    lowerRaw.includes('hybrid') ||
    titleLower.includes('hybrid')
  ) {
    workMode = 'hybrid';
  } else if (
    workplaceHint === 'onsite' ||
    workplaceHint === 'inperson' ||
    workplaceHint === 'in_person' ||
    workplaceHint === 'in person' ||
    lowerRaw.includes('onsite') ||
    lowerRaw.includes('on-site') ||
    lowerRaw.includes('in-office') ||
    lowerRaw.includes('in office')
  ) {
    workMode = 'onsite';
  }

  // 2. Check for Remote India specific patterns ("Remote, India", "India (Remote)", etc.)
  for (const pattern of locationAliases.remoteIndiaPatterns) {
    if (lowerRaw.includes(pattern)) {
      return {
        locationRaw,
        city: null,
        state: null,
        country: 'India',
        workMode: 'remote'
      };
    }
  }

  // 3. Match canonical city aliases
  let matchedCity = null;
  let matchedState = null;
  let matchedCountry = null;

  for (const [canonicalCity, data] of Object.entries(locationAliases.cities)) {
    const isMatch = data.aliases.some((alias) => {
      // Word-boundary matching to avoid substring false positives (e.g. "Goa" in "Goalkeeping")
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(lowerRaw);
    });

    if (isMatch) {
      matchedCity = canonicalCity;
      matchedState = data.state;
      matchedCountry = data.country;
      break;
    }
  }

  // 4. Country resolution if city wasn't matched or to confirm India
  if (!matchedCountry) {
    if (/\bindia\b|\bdelhi\b|\bbangalore\b|\bblr\b/i.test(lowerRaw) || lowerRaw.endsWith(', in') || lowerRaw.endsWith(', in/')) {
      matchedCountry = 'India';
    }
  }

  return {
    locationRaw,
    city: matchedCity,
    state: matchedState,
    country: matchedCountry,
    workMode
  };
}

/**
 * Generates a normalized fingerprint to deduplicate jobs across sources.
 *
 * @param {string} company - Company name
 * @param {string} title - Job title
 * @param {string|null} city - Canonical city or null
 * @returns {string} Normalized fingerprint
 */
function generateFingerprint(company, title, city) {
  const normComp = String(company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTitle = String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normCity = city ? String(city).toLowerCase().replace(/[^a-z0-9]/g, '') : 'none';
  return `${normComp}:${normTitle}:${normCity}`;
}

module.exports = {
  normalizeLocation,
  generateFingerprint
};
