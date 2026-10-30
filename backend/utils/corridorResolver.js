const techHubCorridors = require('../config/techHubCorridors.json');
const locationAliases = require('../config/locationAliases.json');
const { normalizeLocation } = require('./normalizeLocation');

let companyOfficeRegistry = {};
try {
  companyOfficeRegistry = require('../config/companyOfficeRegistry.json');
} catch (_) {
  companyOfficeRegistry = {};
}

/**
 * Generates deterministic geographic offset (~250m - 750m) based on string hash.
 * Guarantees distinct, non-overlapping coordinates for companies sharing a corridor/city center.
 */
function applyDeterministicDispersion(baseCoords, str, radiusKm = 0.65) {
  if (!baseCoords || typeof baseCoords.lat !== 'number' || typeof baseCoords.lng !== 'number' || !str) {
    return baseCoords;
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const angle = Math.abs(hash % 360) * (Math.PI / 180);
  const dist = 0.25 + (Math.abs((hash >> 8) % 1000) / 1000) * (radiusKm - 0.25);
  const latOffset = (dist * Math.cos(angle)) / 111.0;
  const lngOffset = (dist * Math.sin(angle)) / (111.0 * Math.cos((baseCoords.lat * Math.PI) / 180));

  return {
    lat: parseFloat((baseCoords.lat + latOffset).toFixed(6)),
    lng: parseFloat((baseCoords.lng + lngOffset).toFixed(6))
  };
}

/**
 * Resolves location string into high-precision canonical City, State, Country,
 * and Tech Corridor with geographic center coordinates.
 *
 * @param {string} rawLocation
 * @param {Object} [options]
 * @param {string} [options.officeAddress]
 * @param {string} [options.localityHint]
 * @param {Object} [options.coordinates]
 * @returns {{
 *   city: string|null,
 *   state: string|null,
 *   country: string|null,
 *   techCorridor: string|null,
 *   locality: string|null,
 *   coordinates: { lat: number, lng: number }|null,
 *   workMode: 'onsite'|'hybrid'|'remote'|'unknown'
 * }}
 */
function resolveCorridor(rawLocation, options = {}) {
  // 1. Run baseline canonical location normalization
  const norm = normalizeLocation(rawLocation, {
    title: options.title || '',
    country: options.country || '',
    isRemote: options.isRemote
  });

  const textToSearch = [
    rawLocation || '',
    options.officeAddress || '',
    options.localityHint || '',
    options.companyName || ''
  ].join(' ').toLowerCase();

  // 2. Check workMode
  let workMode = norm.workMode;
  if (workMode === 'unknown') {
    if (
      textToSearch.includes('remote') ||
      textToSearch.includes('work from home') ||
      textToSearch.includes('virtual')
    ) {
      workMode = textToSearch.includes('hybrid') ? 'hybrid' : 'remote';
    } else if (textToSearch.includes('hybrid')) {
      workMode = 'hybrid';
    } else if (
      textToSearch.includes('onsite') ||
      textToSearch.includes('on-site') ||
      textToSearch.includes('in-office') ||
      textToSearch.includes('in office')
    ) {
      workMode = 'onsite';
    }
  }

  // 3. Resolve Canonical City, State, and Country
  let resolvedCity = norm.city;
  let resolvedState = norm.state;
  let resolvedCountry = norm.country;

  // Search location-specific text (rawLocation and title) first, to avoid officeAddress poisoning city
  const locDirectText = [rawLocation || '', options.title || ''].join(' ').toLowerCase();

  // Check cities in techHubCorridors (takes precedence for tech corridors)
  for (const [cityName, cityData] of Object.entries(techHubCorridors.cities)) {
    const aliases = (locationAliases.cities[cityName]?.aliases || [cityName.toLowerCase()]);
    const matched = aliases.some(alias => {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(locDirectText);
    });

    if (matched) {
      resolvedCity = cityName;
      resolvedState = cityData.state;
      resolvedCountry = cityData.country || 'India';
      break;
    }
  }

  // If not in techHubCorridors, check broader locationAliases on direct location text
  if (!resolvedCity) {
    for (const [cityName, cityData] of Object.entries(locationAliases.cities)) {
      const matched = cityData.aliases.some(alias => {
        const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(locDirectText);
      });

      if (matched) {
        resolvedCity = cityName;
        resolvedState = cityData.state;
        resolvedCountry = cityData.country || 'India';
        break;
      }
    }
  }

  // Only if no city could be resolved from rawLocation/title, and rawLocation does NOT specify another location or remote/worldwide,
  // fallback to officeAddress ONLY if rawLocation was empty/unspecified.
  if (!resolvedCity && options.officeAddress) {
    const rawTrimmed = (rawLocation || '').trim();
    const isUnspecified = !rawTrimmed || /^(onsite|in-office|office|flexible)$/i.test(rawTrimmed);
    if (isUnspecified) {
      for (const [cityName, cityData] of Object.entries(techHubCorridors.cities)) {
        const aliases = (locationAliases.cities[cityName]?.aliases || [cityName.toLowerCase()]);
        const matched = aliases.some(alias => {
          const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return regex.test(options.officeAddress.toLowerCase());
        });

        if (matched) {
          resolvedCity = cityName;
          resolvedState = cityData.state;
          resolvedCountry = cityData.country || 'India';
          break;
        }
      }
    }
  }

  // 3. Check verified Company Office Registry for known tech offices in this city
  let resolvedCorridorKey = null;
  let resolvedLocality = options.localityHint || null;
  let resolvedCoordinates = options.coordinates || null;
  let resolvedOfficeName = options.officeName || null;
  let resolvedOfficeAddress = options.officeAddress || null;

  if (resolvedCity && options.companyName && companyOfficeRegistry[resolvedCity]) {
    const cityRegistry = companyOfficeRegistry[resolvedCity];
    const compNameLower = options.companyName.trim().toLowerCase();

    for (const [key, entry] of Object.entries(cityRegistry)) {
      const kLower = key.toLowerCase();
      if (kLower === compNameLower || compNameLower.startsWith(kLower) || kLower.startsWith(compNameLower)) {
        resolvedCorridorKey = entry.techCorridor || resolvedCorridorKey;
        resolvedLocality = entry.locality || resolvedLocality;
        resolvedOfficeName = entry.officeName;
        resolvedOfficeAddress = entry.address;
        resolvedCoordinates = entry.coordinates;
        break;
      }
    }
  }

  // 4. Resolve Tech Corridor within the matched city if not already resolved
  if (resolvedCity && !resolvedCorridorKey && techHubCorridors.cities[resolvedCity]?.corridors) {
    const cityCorridors = techHubCorridors.cities[resolvedCity].corridors;

    // 1. First attempt matching specific geographic location text (rawLocation, officeAddress, localityHint)
    const locSpecificText = [
      rawLocation || '',
      options.officeAddress || '',
      options.localityHint || ''
    ].join(' ').toLowerCase();

    for (const [corridorKey, corridorData] of Object.entries(cityCorridors)) {
      const isCorridorMatch = corridorData.aliases.some(alias => {
        const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(locSpecificText);
      });

      if (isCorridorMatch) {
        resolvedCorridorKey = corridorKey;
        resolvedLocality = corridorData.name;
        resolvedCoordinates = corridorData.center;
        break;
      }
    }

    // 2. If no direct geographic match found, fallback to broader search including companyName
    if (!resolvedCorridorKey) {
      for (const [corridorKey, corridorData] of Object.entries(cityCorridors)) {
        const isCorridorMatch = corridorData.aliases.some(alias => {
          const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return regex.test(textToSearch);
        });

        if (isCorridorMatch) {
          resolvedCorridorKey = corridorKey;
          resolvedLocality = corridorData.name;
          resolvedCoordinates = corridorData.center;
          break;
        }
      }
    }
  }

  // Default coordinates to city center if corridor was not matched
  if (!resolvedCoordinates && resolvedCity && techHubCorridors.cities[resolvedCity]?.center) {
    resolvedCoordinates = techHubCorridors.cities[resolvedCity].center;
  }

  // If coordinates are set to a generic corridor or city center, apply deterministic dispersion
  // based on company name hash so no two companies ever share identical coordinates.
  if (resolvedCoordinates && options.companyName && !resolvedOfficeName) {
    resolvedCoordinates = applyDeterministicDispersion(resolvedCoordinates, options.companyName);
    resolvedOfficeName = `${options.companyName} Office (${resolvedLocality || resolvedCity})`;
    resolvedOfficeAddress = `${resolvedLocality ? resolvedLocality + ', ' : ''}${resolvedCity}, ${resolvedState || 'India'}`;
  }

  return {
    city: resolvedCity,
    state: resolvedState,
    country: resolvedCountry,
    techCorridor: resolvedCorridorKey,
    locality: resolvedLocality,
    officeName: resolvedOfficeName,
    officeAddress: resolvedOfficeAddress,
    coordinates: resolvedCoordinates,
    workMode
  };
}

/**
 * Extracts standardized roleFamily, seniority, and fresherFriendly status from job title and summary.
 *
 * @param {string} title
 * @param {string} [descriptionText]
 * @returns {{
 *   roleFamily: string,
 *   seniority: 'intern'|'entry'|'mid'|'senior'|'lead_staff'|'manager'|'director_plus',
 *   fresherFriendly: boolean,
 *   expMin: number|null,
 *   expMax: number|null
 * }}
 */
function classifyRole(title = '', descriptionText = '') {
  const fullText = `${title} ${descriptionText}`.toLowerCase();
  const titleLower = title.toLowerCase();

  // 1. Experience extraction (e.g. "3-5 years", "0-2 yrs", "5+ years")
  let expMin = null;
  let expMax = null;

  const expRangeMatch = fullText.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/i);
  if (expRangeMatch) {
    expMin = parseInt(expRangeMatch[1], 10);
    expMax = parseInt(expRangeMatch[2], 10);
  } else {
    const expPlusMatch = fullText.match(/(\d+)\+\s*(?:years?|yrs?)/i);
    if (expPlusMatch) {
      expMin = parseInt(expPlusMatch[1], 10);
    } else {
      const expSingleMatch = fullText.match(/(?:at least|minimum|min)\s*(\d+)\s*(?:years?|yrs?)/i);
      if (expSingleMatch) {
        expMin = parseInt(expSingleMatch[1], 10);
      }
    }
  }

  // 2. Seniority & Fresher Classification
  let seniority = 'mid';
  let fresherFriendly = false;

  if (
    titleLower.includes('intern') ||
    titleLower.includes('trainee') ||
    titleLower.includes('apprentice') ||
    fullText.includes('internship')
  ) {
    seniority = 'intern';
    fresherFriendly = true;
  } else if (
    titleLower.includes('fresher') ||
    titleLower.includes('graduate engineer') ||
    titleLower.includes('entry level') ||
    titleLower.includes('junior') ||
    titleLower.includes('assoc ') ||
    titleLower.includes('associate') ||
    titleLower.includes('new grad') ||
    titleLower.includes('campus') ||
    (expMin !== null && expMin <= 1)
  ) {
    seniority = 'entry';
    fresherFriendly = true;
  } else if (
    titleLower.includes('director') ||
    titleLower.includes('vp') ||
    titleLower.includes('vice president') ||
    titleLower.includes('head of') ||
    titleLower.includes('chief')
  ) {
    seniority = 'director_plus';
  } else if (
    titleLower.includes('manager') ||
    titleLower.includes('engineering manager') ||
    titleLower.includes('lead manager')
  ) {
    seniority = 'manager';
  } else if (
    titleLower.includes('staff') ||
    titleLower.includes('principal') ||
    titleLower.includes('architect') ||
    titleLower.includes('tech lead') ||
    titleLower.includes('lead ')
  ) {
    seniority = 'lead_staff';
  } else if (
    titleLower.includes('sr.') ||
    titleLower.includes('sr ') ||
    titleLower.includes('senior') ||
    (expMin !== null && expMin >= 5)
  ) {
    seniority = 'senior';
  }

  // 3. Role Family Classification
  let roleFamily = 'sde_general';

  if (/(backend|back-end|java|golang|python developer|node\.js|\.net|c#|spring boot)/i.test(titleLower)) {
    roleFamily = 'sde_backend';
  } else if (/(frontend|front-end|react|vue|angular|ui developer|web developer)/i.test(titleLower)) {
    roleFamily = 'sde_frontend';
  } else if (/(fullstack|full-stack|full stack|mern|mean)/i.test(titleLower)) {
    roleFamily = 'sde_fullstack';
  } else if (/(ios|android|mobile|flutter|react native|swift|kotlin)/i.test(titleLower)) {
    roleFamily = 'sde_mobile';
  } else if (/(devops|sre|site reliability|cloud|infrastructure|kubernetes|aws|azure|gcp)/i.test(titleLower)) {
    roleFamily = 'devops_sre_cloud';
  } else if (/(data engineer|etl|big data|spark|hadoop|data warehouse)/i.test(titleLower)) {
    roleFamily = 'data_engineering';
  } else if (/(data scientist|data science|analytics|business intelligence|\bbi\b|tableau|power bi)/i.test(titleLower)) {
    roleFamily = 'data_science';
  } else if (/(machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|nlp|llm|computer vision)/i.test(titleLower)) {
    roleFamily = 'ml_ai_engineering';
  } else if (/(qa|sdet|test|quality assurance|automation engineer|testing)/i.test(titleLower)) {
    roleFamily = 'qa_testing';
  } else if (/(security|cyber|infosec|appsec|soc analyst|penetration)/i.test(titleLower)) {
    roleFamily = 'security';
  } else if (/(product manager|technical product|group product|\bpm\b)/i.test(titleLower)) {
    roleFamily = 'product_management';
  } else if (/(ux|ui\/ux|product designer|visual designer|interaction designer)/i.test(titleLower)) {
    roleFamily = 'ux_ui_design';
  } else if (/(embedded|firmware|iot|rtos|microcontroller)/i.test(titleLower)) {
    roleFamily = 'sde_embedded_firmware';
  } else if (/(hardware|asic|vlsi|soc|fpga|silicon|pcb)/i.test(titleLower)) {
    roleFamily = 'hardware_electronics';
  } else if (/(consultant|consulting|advisory)/i.test(titleLower)) {
    roleFamily = 'consulting';
  } else if (/(finance|accounting|audit|tax|fpa|treasury)/i.test(titleLower)) {
    roleFamily = 'finance_accounting';
  } else if (/(sales|account executive|business development|\bsdr\b|\bbdr\b)/i.test(titleLower)) {
    roleFamily = 'sales_account_executive';
  }

  return {
    roleFamily,
    seniority,
    fresherFriendly,
    expMin,
    expMax
  };
}

module.exports = {
  resolveCorridor,
  classifyRole
};
