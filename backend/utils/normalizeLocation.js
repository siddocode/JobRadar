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

  // 4. Country & International City Resolution
  if (!matchedCountry) {
    // Check hints first
    const hintCountry = String(hints.country || hints.addressCountry || hints.countryCode || '').toUpperCase().trim();
    if (['IN', 'IND', 'INDIA'].includes(hintCountry)) {
      matchedCountry = 'India';
    } else if (['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(hintCountry)) {
      matchedCountry = 'United States';
    } else if (['GB', 'GBR', 'UK', 'UNITED KINGDOM'].includes(hintCountry)) {
      matchedCountry = 'United Kingdom';
    } else if (['CA', 'CAN', 'CANADA'].includes(hintCountry)) {
      matchedCountry = 'Canada';
    } else if (['DE', 'DEU', 'GERMANY'].includes(hintCountry)) {
      matchedCountry = 'Germany';
    } else if (['IE', 'IRL', 'IRELAND'].includes(hintCountry)) {
      matchedCountry = 'Ireland';
    } else if (['AU', 'AUS', 'AUSTRALIA'].includes(hintCountry)) {
      matchedCountry = 'Australia';
    } else if (['FR', 'FRA', 'FRANCE'].includes(hintCountry)) {
      matchedCountry = 'France';
    } else if (['SG', 'SGP', 'SINGAPORE'].includes(hintCountry)) {
      matchedCountry = 'Singapore';
    } else if (['JP', 'JPN', 'JAPAN'].includes(hintCountry)) {
      matchedCountry = 'Japan';
    } else if (['NL', 'NLD', 'NETHERLANDS'].includes(hintCountry)) {
      matchedCountry = 'Netherlands';
    } else if (['IL', 'ISR', 'ISRAEL'].includes(hintCountry)) {
      matchedCountry = 'Israel';
    } else if (['BR', 'BRA', 'BRAZIL'].includes(hintCountry)) {
      matchedCountry = 'Brazil';
    } else if (['CH', 'CHE', 'SWITZERLAND'].includes(hintCountry)) {
      matchedCountry = 'Switzerland';
    } else if (['MX', 'MEX', 'MEXICO'].includes(hintCountry)) {
      matchedCountry = 'Mexico';
    } else if (['RO', 'ROU', 'ROMANIA'].includes(hintCountry)) {
      matchedCountry = 'Romania';
    } else if (['ES', 'ESP', 'SPAIN'].includes(hintCountry)) {
      matchedCountry = 'Spain';
    } else if (['PL', 'POL', 'POLAND'].includes(hintCountry)) {
      matchedCountry = 'Poland';
    }
  }

  // Also check if applyUrl has location hint (e.g. Workday "/job/San-Jose/...")
  let effectiveRaw = lowerRaw;
  if ((effectiveRaw === 'unspecified' || /\b\d+\s+locations\b/i.test(effectiveRaw)) && hints.applyUrl) {
    const urlMatch = String(hints.applyUrl).match(/\/job\/([a-zA-Z0-9_-]+)\//i);
    if (urlMatch && urlMatch[1]) {
      effectiveRaw = urlMatch[1].replace(/[-_]+/g, ' ').toLowerCase();
    }
  }

  // Regex text matching for countries and cities
  if (!matchedCountry) {
    if (/\bindia\b|\bdelhi\b|\bbangalore\b|\bbengaluru\b|\bhyderabad\b|\bpune\b|\bmumbai\b|\bchennai\b|\bkolkata\b|\bnoida\b|\bgurugram\b|\bgurgaon\b/i.test(effectiveRaw) || effectiveRaw.endsWith(', in') || effectiveRaw.endsWith(', in/')) {
      matchedCountry = 'India';
    } else if (/\b(united states|usa|u\.s\.a?|u\.s\b|us remote|america)\b/i.test(effectiveRaw) ||
               /,\s*(ca|ny|tx|wa|ma|il|co|ga|nc|va|fl|nj|pa|oh|mi|mn|md|az|or|ut|dc|tn|mo|wi|ct|sc|ky|la|al|ia|ks|nv|ok|ne|nm|id|hi|me|nh|ri|vt|de|mt|nd|sd|ak|wv|wy)\b/i.test(effectiveRaw) ||
               /\b(san francisco|san jose|new york|seattle|austin|sunnyvale|los angeles|chicago|boston|atlanta|denver|mountain view|palo alto|redwood city|santa clara|dallas|houston|pittsburgh|menlo park|cupertino|kirkland|bellevue|boulder|brooklyn|manhattan|raleigh|durham|san diego|philadelphia|detroit|minneapolis|miami|portland|salt lake city|arlington|reston|mclean)\b/i.test(effectiveRaw)) {
      matchedCountry = 'United States';
    } else if (/\b(united kingdom|great britain|england|scotland|wales|london|manchester|birmingham|reading|edinburgh|cambridge|oxford|bristol|glasgow|belfast|cardiff|leeds|sheffield|newcastle|nottingham)\b/i.test(effectiveRaw) || /\b(uk|gbr)\b/i.test(effectiveRaw)) {
      matchedCountry = 'United Kingdom';
    } else if (/\b(canada|toronto|vancouver|montreal|ottawa|calgary|waterloo|edmonton|quebec city|mississauga|halifax|victoria)\b/i.test(effectiveRaw) || /,\s*(on|bc|ab|qc|ns|mb|sk)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Canada';
    } else if (/\b(germany|deutschland|berlin|munich|münchen|frankfurt|hamburg|cologne|köln|stuttgart|düsseldorf|leipzig|dresden|bonn)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Germany';
    } else if (/\b(ireland|dublin|cork|galway|limerick|waterford)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Ireland';
    } else if (/\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra|gold coast)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Australia';
    } else if (/\b(france|paris|lyon|marseille|toulouse|bordeaux|nantes|strasbourg|lille|sophia antipolis)\b/i.test(effectiveRaw)) {
      matchedCountry = 'France';
    } else if (/\b(singapore)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Singapore';
    } else if (/\b(netherlands|holland|amsterdam|rotterdam|utrecht|the hague|den haag|eindhoven)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Netherlands';
    } else if (/\b(japan|tokyo|osaka|kyoto|yokohama|fukuoka|nagoya)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Japan';
    } else if (/\b(israel|tel aviv|herzliya|jerusalem|haifa)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Israel';
    } else if (/\b(brazil|brasil|são paulo|sao paulo|rio de janeiro|curitiba|florianópolis|florianopolis|belo horizonte)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Brazil';
    } else if (/\b(switzerland|zurich|zürich|geneva|genève|lausanne|basel|bern)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Switzerland';
    } else if (/\b(mexico|mexico city|ciudad de méxico|guadalajara|monterrey)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Mexico';
    } else if (/\b(romania|bucharest|cluj|cluj-napoca|timisoara|timișoara|iasi|iași)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Romania';
    } else if (/\b(spain|madrid|barcelona|valencia|seville|malaga|bilbao)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Spain';
    } else if (/\b(poland|warsaw|warszawa|krakow|kraków|wroclaw|wrocław|gdansk|gdańsk)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Poland';
    } else if (/\b(remote|worldwide|anywhere|global)\b/i.test(effectiveRaw)) {
      matchedCountry = 'Remote / Global';
    }
  }

  // If city was not matched, extract foreign city if recognized
  if (!matchedCity && matchedCountry) {
    const cityMatches = [
      { name: 'San Francisco', regex: /\bsan francisco\b/i },
      { name: 'San Jose', regex: /\bsan jose\b/i },
      { name: 'New York', regex: /\bnew york\b/i },
      { name: 'Seattle', regex: /\bseattle\b/i },
      { name: 'Austin', regex: /\baustin\b/i },
      { name: 'Sunnyvale', regex: /\bsunnyvale\b/i },
      { name: 'Los Angeles', regex: /\blos angeles\b/i },
      { name: 'Chicago', regex: /\bchicago\b/i },
      { name: 'Boston', regex: /\bboston\b/i },
      { name: 'London', regex: /\blondon\b/i },
      { name: 'Reading', regex: /\breading\b/i },
      { name: 'Manchester', regex: /\bmanchester\b/i },
      { name: 'Toronto', regex: /\btoronto\b/i },
      { name: 'Vancouver', regex: /\bvancouver\b/i },
      { name: 'Berlin', regex: /\bberlin\b/i },
      { name: 'Munich', regex: /\b(munich|münchen)\b/i },
      { name: 'Dublin', regex: /\bdublin\b/i },
      { name: 'Sydney', regex: /\bsydney\b/i },
      { name: 'Melbourne', regex: /\bmelbourne\b/i },
      { name: 'Paris', regex: /\bparis\b/i },
      { name: 'Singapore', regex: /\bsingapore\b/i },
      { name: 'Amsterdam', regex: /\bamsterdam\b/i },
      { name: 'Tokyo', regex: /\btokyo\b/i },
      { name: 'Tel Aviv', regex: /\btel aviv\b/i },
      { name: 'Bucharest', regex: /\bbucharest\b/i },
      { name: 'Mexico City', regex: /\bmexico city\b/i }
    ];

    for (const cm of cityMatches) {
      if (cm.regex.test(effectiveRaw)) {
        matchedCity = cm.name;
        break;
      }
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
