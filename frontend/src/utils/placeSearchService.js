/**
 * placeSearchService.js
 * High-performance, location-biased geocoding & place autocomplete service.
 * Operates like Google Maps: heavily prioritizes places near the user's current GPS location/map viewport,
 * recognizes Indian abbreviations ("kol", "blr", "hyd", etc.), and queries multiple tiers:
 * 1. Curated local POIs, tech corridors, corporate parks, eateries & landmarks (0ms)
 * 2. Backend database offices & companies (/api/directory/places/search)
 * 3. Location-biased Photon Geocoder (OSM + Komoot, biased to user coords)
 * 4. Location-biased OSM Nominatim (bounded viewbox & countrycode)
 */

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = parseFloat(lat1);
  const numLon1 = parseFloat(lon1);
  const numLat2 = parseFloat(lat2);
  const numLon2 = parseFloat(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // km
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) * Math.cos(numLat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.round(dist * 10) / 10;
}

export function formatDistance(km) {
  if (km == null || isNaN(km)) return null;
  if (km < 1) {
    return `${Math.round(km * 1000)} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

// City abbreviation mapping to full city names
const CITY_ABBREVIATIONS = {
  kol: 'kolkata',
  cal: 'kolkata',
  blr: 'bengaluru',
  bglr: 'bengaluru',
  bangalore: 'bengaluru',
  hyd: 'hyderabad',
  sec: 'secunderabad',
  ggn: 'gurugram',
  gurgaon: 'gurugram',
  del: 'delhi',
  ncr: 'delhi',
  mum: 'mumbai',
  bom: 'mumbai',
  bombay: 'mumbai',
  pune: 'pune',
  pnq: 'pune',
  chn: 'chennai',
  maa: 'chennai',
  madras: 'chennai',
  noida: 'noida'
};

// Curated high-frequency Indian tech hubs, business clusters, eateries & landmarks
export const CURATED_PLACES = [
  // --- KOLKATA ---
  {
    label: 'Rang De Basanti Dhaba, Sector 5, Salt Lake',
    fullAddress: 'DN-37, Sector V, Bidhannagar, Kolkata, West Bengal 700091',
    city: 'Kolkata',
    lat: 22.5804,
    lng: 88.4378,
    category: 'food',
    aliases: ['rang de basanti dhaba', 'rang de basanti', 'dhaba kolkata', 'rang de basanti salt lake', 'rang de basanti sector 5', 'dhaba sector v']
  },
  {
    label: 'Rang De Basanti Dhaba, EM Bypass (Topsia / Ruby)',
    fullAddress: 'EM Bypass, Topsia, Near Ruby Hospital, Kolkata, West Bengal 700046',
    city: 'Kolkata',
    lat: 22.5350,
    lng: 88.3965,
    category: 'food',
    aliases: ['rang de basanti dhaba', 'rang de basanti em bypass', 'rang de basanti ruby', 'dhaba em bypass']
  },
  {
    label: 'Rang De Basanti Dhaba, Diamond Harbour Road, Behala',
    fullAddress: 'Diamond Harbour Road, Behala Chowrasta, Kolkata, West Bengal 700034',
    city: 'Kolkata',
    lat: 22.4988,
    lng: 88.3186,
    category: 'food',
    aliases: ['rang de basanti dhaba', 'rang de basanti behala', 'dhaba behala']
  },
  {
    label: 'Rang De Basanti Dhaba, Deshapriya Park (Sarat Bose Road)',
    fullAddress: 'Sarat Bose Road, Near Deshapriya Park, Kolkata, West Bengal 700029',
    city: 'Kolkata',
    lat: 22.5188,
    lng: 88.3534,
    category: 'food',
    aliases: ['rang de basanti dhaba', 'rang de basanti deshapriya park', 'rang de basanti sarat bose road']
  },
  {
    label: 'Rang De Basanti Urban Dhaba, New Market / Esplanade',
    fullAddress: 'Humayun Place, New Market, Esplanade, Kolkata, West Bengal 700087',
    city: 'Kolkata',
    lat: 22.5530,
    lng: 88.3520,
    category: 'food',
    aliases: ['rang de basanti urban dhaba', 'rang de basanti new market', 'rang de basanti esplanade']
  },
  {
    label: 'Dhaba Ballygunge, Gariahat Road',
    fullAddress: 'Gariahat Road, Ballygunge Phari, Kolkata, West Bengal 700019',
    city: 'Kolkata',
    lat: 22.5282,
    lng: 88.3658,
    category: 'food',
    aliases: ['dhaba', 'dhaba ballygunge', 'the dhaba ballygunge', 'gariahata dhaba']
  },
  {
    label: 'Peter Cat, Park Street',
    fullAddress: '18A, Park Street, Park Street area, Kolkata, West Bengal 700016',
    city: 'Kolkata',
    lat: 22.5515,
    lng: 88.3528,
    category: 'food',
    aliases: ['peter cat', 'chelo kebab', 'park street restaurants']
  },
  {
    label: 'Mocambo Restaurant & Bar, Park Street',
    fullAddress: '25B, Park Street, Kolkata, West Bengal 700016',
    city: 'Kolkata',
    lat: 22.5516,
    lng: 88.3530,
    category: 'food',
    aliases: ['mocambo', 'mocambo park street']
  },
  {
    label: 'Arsalan Restaurant, Park Circus 7 Point',
    fullAddress: '191, Marina Garden Court, Park Street, Park Circus, Kolkata 700017',
    city: 'Kolkata',
    lat: 22.5434,
    lng: 88.3688,
    category: 'food',
    aliases: ['arsalan', 'arsalan biryani', 'park circus biryani']
  },
  {
    label: 'Salt Lake Sector V Tech Hub',
    fullAddress: 'Sector V, Bidhannagar, Greater Kolkata, West Bengal 700091',
    city: 'Kolkata',
    lat: 22.5804,
    lng: 88.4378,
    category: 'office',
    aliases: ['sector 5', 'sector v', 'salt lake sector 5', 'salt lake sector v', 'bidhannagar sector 5']
  },
  {
    label: 'Candor TechSpace, New Town Action Area 1',
    fullAddress: 'Action Area 1D, New Town, Rajarhat, Kolkata, West Bengal 700156',
    city: 'Kolkata',
    lat: 22.5867,
    lng: 88.4734,
    category: 'office',
    aliases: ['candor techspace', 'unitech infospace', 'candor new town', 'action area 1 tech park']
  },
  {
    label: 'DLF IT Park 1 & 2, New Town',
    fullAddress: 'Major Arterial Road, Action Area II, New Town, Kolkata 700156',
    city: 'Kolkata',
    lat: 22.5762,
    lng: 88.4682,
    category: 'office',
    aliases: ['dlf it park', 'dlf new town', 'dlf 1', 'dlf 2 new town']
  },
  {
    label: 'Godrej Genesis, EP & GP Block, Sector V',
    fullAddress: 'EP & GP Block, Sector V, Bidhannagar, Kolkata 700091',
    city: 'Kolkata',
    lat: 22.5752,
    lng: 88.4348,
    category: 'office',
    aliases: ['godrej genesis', 'ep block sector 5', 'gp block sector 5']
  },
  {
    label: 'Wipro Campus, Sector V, Salt Lake',
    fullAddress: 'CN-1, Camac St, DN Block, Sector V, Salt Lake, Kolkata 700091',
    city: 'Kolkata',
    lat: 22.5792,
    lng: 88.4308,
    category: 'office',
    aliases: ['wipro tower 5', 'wipro kolkata', 'wipro campus salt lake']
  },
  {
    label: 'TCS Gitanjali Park, New Town',
    fullAddress: 'TCS Gitanjali Park, Action Area II, New Town, Rajarhat, Kolkata 700156',
    city: 'Kolkata',
    lat: 22.5925,
    lng: 88.4835,
    category: 'office',
    aliases: ['tcs gitanjali park', 'tcs new town', 'tcs kolkata', 'gitanjali park']
  },
  {
    label: 'Cognizant Techno Complex, Sector V',
    fullAddress: 'Plot GN 34/3, Sector V, Salt Lake Electronics Complex, Kolkata 700091',
    city: 'Kolkata',
    lat: 22.5721,
    lng: 88.4332,
    category: 'office',
    aliases: ['cognizant sector 5', 'cognizant techno complex', 'cts kolkata']
  },
  {
    label: 'Park Street / Camac Street CBD',
    fullAddress: 'Park Street & Camac Street Commercial Area, Kolkata 700016',
    city: 'Kolkata',
    lat: 22.5512,
    lng: 88.3526,
    category: 'landmark',
    aliases: ['park street', 'camac street', 'park street kolkata', 'camac street kolkata']
  },
  {
    label: 'Sealdah Railway Station',
    fullAddress: 'Bipin Behari Ganguly St, Sealdah, Raja Bazar, Kolkata 700014',
    city: 'Kolkata',
    lat: 22.5643,
    lng: 88.3693,
    category: 'landmark',
    aliases: ['sealdah', 'sealdah station', 'sealdah kolkata', 'sealdah south']
  },
  {
    label: 'Howrah Railway Station',
    fullAddress: 'Station Road, Howrah Railway Station, Howrah, West Bengal 711101',
    city: 'Howrah',
    lat: 22.5839,
    lng: 88.3426,
    category: 'landmark',
    aliases: ['howrah', 'howrah station', 'howrah junction']
  },
  {
    label: 'Netaji Subhash Chandra Bose International Airport (CCU)',
    fullAddress: 'Jessore Rd, Dum Dum, Kolkata, West Bengal 700052',
    city: 'Kolkata',
    lat: 22.6547,
    lng: 88.4467,
    category: 'landmark',
    aliases: ['airport', 'kolkata airport', 'ccu', 'dum dum airport']
  },

  // --- BENGALURU ---
  {
    label: 'Koramangala 5th Block Startup Corridor',
    fullAddress: 'Koramangala 5th Block, Bengaluru, Karnataka 560095',
    city: 'Bengaluru',
    lat: 12.9352,
    lng: 77.6245,
    category: 'office',
    aliases: ['koramangala', 'koramangala 5th block', 'koramangala startup hub']
  },
  {
    label: 'HSR Layout Sector 1-7 Tech Hub',
    fullAddress: 'HSR Layout, Bengaluru, Karnataka 560102',
    city: 'Bengaluru',
    lat: 12.9121,
    lng: 77.6446,
    category: 'office',
    aliases: ['hsr', 'hsr layout', 'hsr sector 5', 'hsr sector 1', 'hsr sector 2', 'hsr sector 3']
  },
  {
    label: 'Whitefield / ITPL Tech Corridor',
    fullAddress: 'International Tech Park, Whitefield, Bengaluru, Karnataka 560066',
    city: 'Bengaluru',
    lat: 12.9856,
    lng: 77.7489,
    category: 'office',
    aliases: ['whitefield', 'itpl', 'itpb', 'international tech park bangalore']
  },
  {
    label: 'Manyata Tech Park & Hebbal',
    fullAddress: 'Nagavara, Hebbal, Outer Ring Road, Bengaluru, Karnataka 560045',
    city: 'Bengaluru',
    lat: 13.0497,
    lng: 77.6211,
    category: 'office',
    aliases: ['manyata', 'manyata tech park', 'hebbal it park', 'manyata embassy']
  },
  {
    label: 'RMZ Ecoworld & Bellandur ORR',
    fullAddress: 'Outer Ring Road, Bellandur, Devarabeesanahalli, Bengaluru 560103',
    city: 'Bengaluru',
    lat: 12.9304,
    lng: 77.6850,
    category: 'office',
    aliases: ['outer ring road', 'orr', 'bellandur', 'rmz ecoworld', 'ecoworld']
  },
  {
    label: 'Electronic City Phases 1 & 2',
    fullAddress: 'Electronic City, Hosur Road, Bengaluru, Karnataka 560100',
    city: 'Bengaluru',
    lat: 12.8457,
    lng: 77.6679,
    category: 'office',
    aliases: ['electronic city', 'e-city', 'electronic city phase 1', 'electronic city phase 2']
  },
  {
    label: 'Indiranagar 100ft Road',
    fullAddress: '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
    city: 'Bengaluru',
    lat: 12.9784,
    lng: 77.6408,
    category: 'landmark',
    aliases: ['indiranagar', '100ft road indiranagar', 'indiranagar 100 feet road']
  },

  // --- HYDERABAD ---
  {
    label: 'HITEC City & Cyber Towers',
    fullAddress: 'HITEC City, Madhapur, Hyderabad, Telangana 500081',
    city: 'Hyderabad',
    lat: 17.4483,
    lng: 78.3915,
    category: 'office',
    aliases: ['hitec city', 'hitech city', 'cyber towers', 'madhapur it park']
  },
  {
    label: 'Gachibowli & Wipro Circle',
    fullAddress: 'Gachibowli, Hyderabad, Telangana 500032',
    city: 'Hyderabad',
    lat: 17.4401,
    lng: 78.3489,
    category: 'office',
    aliases: ['gachibowli', 'wipro circle gachibowli', 'dlf cybercity hyderabad']
  },
  {
    label: 'Financial District & Nanakramguda',
    fullAddress: 'Nanakramguda, Financial District, Hyderabad, Telangana 500032',
    city: 'Hyderabad',
    lat: 17.4140,
    lng: 78.3430,
    category: 'office',
    aliases: ['financial district', 'nanakramguda', 'waverock', 'kokapet']
  },

  // --- GURUGRAM / DELHI NCR ---
  {
    label: 'DLF Cyber City & CyberHub',
    fullAddress: 'DLF Phase 2, Sector 24, Gurugram, Haryana 122002',
    city: 'Gurugram',
    lat: 28.4950,
    lng: 77.0890,
    category: 'office',
    aliases: ['cyber city', 'dlf cyber city', 'cyberhub', 'cyber hub gurugram']
  },
  {
    label: 'Golf Course Road & One Horizon Center',
    fullAddress: 'Golf Course Road, Sector 43, Gurugram, Haryana 122002',
    city: 'Gurugram',
    lat: 28.4595,
    lng: 77.0988,
    category: 'office',
    aliases: ['golf course road', 'one horizon center', 'sector 43 gurgaon']
  },
  {
    label: 'Sector 62 & Stellar IT Park, Noida',
    fullAddress: 'Sector 62, Noida, Uttar Pradesh 201309',
    city: 'Noida',
    lat: 28.6279,
    lng: 77.3649,
    category: 'office',
    aliases: ['sector 62', 'sec 62', 'sector 62 noida', 'stellar it park']
  },
  {
    label: 'Noida Expressway & Candor TechSpace',
    fullAddress: 'Sector 135, Noida-Greater Noida Expressway, Noida 201304',
    city: 'Noida',
    lat: 28.5080,
    lng: 77.3820,
    category: 'office',
    aliases: ['noida expressway', 'sector 135 noida', 'candor techspace noida', 'advant navis']
  },
  {
    label: 'Aerocity & Worldmark Hospitality Hub',
    fullAddress: 'Worldmark 1, Aerocity, New Delhi, Delhi 110037',
    city: 'New Delhi',
    lat: 28.5505,
    lng: 77.1215,
    category: 'office',
    aliases: ['aerocity', 'worldmark', 'delhi aerocity']
  },
  {
    label: 'Connaught Place (CP) CBD',
    fullAddress: 'Connaught Place, New Delhi, Delhi 110001',
    city: 'New Delhi',
    lat: 28.6315,
    lng: 77.2167,
    category: 'landmark',
    aliases: ['connaught place', 'cp delhi', 'barakhamba road']
  },

  // --- PUNE ---
  {
    label: 'Hinjawadi Rajiv Gandhi Infotech Park',
    fullAddress: 'Hinjawadi Phases 1-3, Pune, Maharashtra 411057',
    city: 'Pune',
    lat: 18.5913,
    lng: 73.7389,
    category: 'office',
    aliases: ['hinjawadi', 'hinjewadi', 'hinjawadi it park', 'rajiv gandhi infotech park']
  },
  {
    label: 'EON Free Zone & Kharadi Tech Hub',
    fullAddress: 'EON Free Zone, Kharadi, Pune, Maharashtra 411014',
    city: 'Pune',
    lat: 18.5529,
    lng: 73.9515,
    category: 'office',
    aliases: ['kharadi', 'eon free zone', 'eon it park', 'kharadi it park']
  },
  {
    label: 'Magarpatta Cybercity & Hadapsar',
    fullAddress: 'Magarpatta City, Hadapsar, Pune, Maharashtra 411028',
    city: 'Pune',
    lat: 18.5158,
    lng: 73.9272,
    category: 'office',
    aliases: ['magarpatta', 'magarpatta city', 'magarpatta cybercity']
  },

  // --- MUMBAI ---
  {
    label: 'Bandra Kurla Complex (BKC)',
    fullAddress: 'G Block, Bandra Kurla Complex, Bandra East, Mumbai 400051',
    city: 'Mumbai',
    lat: 19.0660,
    lng: 72.8680,
    category: 'office',
    aliases: ['bkc', 'bandra kurla complex', 'bkc mumbai']
  },
  {
    label: 'Hiranandani Business Park, Powai',
    fullAddress: 'Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076',
    city: 'Mumbai',
    lat: 19.1197,
    lng: 72.9051,
    category: 'office',
    aliases: ['powai', 'hiranandani powai', 'powai it park']
  },

  // --- CHENNAI ---
  {
    label: 'Old Mahabalipuram Road (OMR IT Expressway)',
    fullAddress: 'OMR IT Corridor, Taramani to Sholinganallur, Chennai 600119',
    city: 'Chennai',
    lat: 12.9150,
    lng: 80.2280,
    category: 'office',
    aliases: ['omr', 'omr chennai', 'tidel park', 'sholinganallur']
  },
  {
    label: 'Olympia Tech Park & Guindy',
    fullAddress: '1, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu 600032',
    city: 'Chennai',
    lat: 13.0067,
    lng: 80.2025,
    category: 'office',
    aliases: ['guindy', 'olympia tech park', 'ekkatuthangal']
  }
];

/**
 * Expands query strings with Indian city abbreviations (e.g. "dhaba kol" -> "dhaba kolkata")
 */
export function expandSearchQuery(inputQuery) {
  if (!inputQuery) return { raw: '', clean: '', targetCity: null, cleanWithoutCity: '' };
  const raw = inputQuery.trim();
  const tokens = raw.toLowerCase().split(/\s+/);

  let targetCity = null;
  const filteredTokens = [];

  for (const t of tokens) {
    if (CITY_ABBREVIATIONS[t]) {
      targetCity = CITY_ABBREVIATIONS[t];
    } else {
      filteredTokens.push(t);
    }
  }

  const cleanWithoutCity = filteredTokens.join(' ');
  const clean = targetCity ? `${cleanWithoutCity} ${targetCity}`.trim() : raw;

  return {
    raw,
    clean,
    targetCity,
    cleanWithoutCity: cleanWithoutCity || raw
  };
}

/**
 * Searches the curated in-memory dataset of high-priority hubs, eateries and landmarks
 */
export function searchCuratedPlaces(query, anchorLat, anchorLng) {
  const { raw, cleanWithoutCity, targetCity } = expandSearchQuery(query);
  const qLower = raw.toLowerCase();
  const qCleanNoCity = cleanWithoutCity.toLowerCase();

  const matches = [];

  for (const place of CURATED_PLACES) {
    let score = 0;
    const labelLower = place.label.toLowerCase();
    const addrLower = place.fullAddress.toLowerCase();
    const cityLower = place.city.toLowerCase();

    // Check city alignment if user typed city abbreviation (e.g. "kol")
    if (targetCity && cityLower !== targetCity) {
      continue;
    }

    // Direct match against label
    if (labelLower.includes(qLower) || labelLower.includes(qCleanNoCity)) {
      score += 100;
    }

    // Match against aliases
    if (place.aliases?.some(a => a.includes(qLower) || qLower.includes(a) || a.includes(qCleanNoCity) || qCleanNoCity.includes(a))) {
      score += 80;
    }

    // Match against address
    if (addrLower.includes(qLower) || addrLower.includes(qCleanNoCity)) {
      score += 40;
    }

    // Partial word token overlap
    const words = qCleanNoCity.split(/\s+/).filter(w => w.length > 2);
    const matchedWords = words.filter(w => labelLower.includes(w) || addrLower.includes(w));
    if (matchedWords.length > 0) {
      score += (matchedWords.length / words.length) * 50;
    }

    if (score > 30) {
      const dist = anchorLat != null && anchorLng != null
        ? calculateDistanceKm(anchorLat, anchorLng, place.lat, place.lng)
        : null;

      matches.push({
        label: place.label,
        fullAddress: place.fullAddress,
        city: place.city,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        source: 'curated_local',
        distanceKm: dist,
        distanceFormatted: formatDistance(dist),
        score: score + (dist != null && dist < 30 ? (30 - dist) : 0)
      });
    }
  }

  // Sort by score + proximity
  matches.sort((a, b) => (b.score || 0) - (a.score || 0));
  return matches;
}

/**
 * Unified Google Maps-like place search:
 * - Prioritizes current GPS / map viewport coordinates
 * - Runs Curated Local, Backend DB Offices, Photon, and Nominatim in parallel
 * - Sorts strictly by relevance and proximity
 */
export async function searchPlacesLikeGoogleMaps(searchQuery, anchorLat, anchorLng, abortSignal) {
  if (!searchQuery || searchQuery.trim().length < 2) {
    return [];
  }

  const { raw, clean, targetCity, cleanWithoutCity } = expandSearchQuery(searchQuery);

  // 1. Instant Curated Local Landmarks (0ms)
  const curatedResults = searchCuratedPlaces(raw, anchorLat, anchorLng);

  // Prepare fallback queries
  const effectiveQuery = targetCity ? clean : raw;
  const seenCoords = new Set();
  const allResults = [];

  // Helper to deduplicate items by coordinate proximity (~100m)
  const addResult = (item) => {
    if (!item || item.lat == null || item.lng == null) return;
    const key = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
    if (seenCoords.has(key)) return;
    seenCoords.add(key);

    const dist = anchorLat != null && anchorLng != null
      ? calculateDistanceKm(anchorLat, anchorLng, item.lat, item.lng)
      : null;

    allResults.push({
      ...item,
      distanceKm: dist,
      distanceFormatted: formatDistance(dist)
    });
  };

  // Add top curated matches first
  curatedResults.forEach(addResult);

  // 2. Parallel Remote Requests (Backend DB + Photon + Nominatim)
  const remotePromises = [];

  // 2a. Backend Database Place Search
  try {
    let dbUrl = `/api/directory/places/search?q=${encodeURIComponent(effectiveQuery)}&limit=8`;
    if (anchorLat != null && anchorLng != null) {
      dbUrl += `&lat=${anchorLat}&lng=${anchorLng}`;
    }
    const dbPromise = fetch(dbUrl, { signal: abortSignal })
      .then(r => r.ok ? r.json() : { places: [] })
      .then(d => {
        if (Array.isArray(d.places)) {
          d.places.forEach(addResult);
        }
      })
      .catch(() => {});
    remotePromises.push(dbPromise);
  } catch (_) {}

  // 2b. Location-Biased Photon Geocoder
  try {
    let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(effectiveQuery)}&limit=10`;
    if (anchorLat != null && anchorLng != null) {
      // Biases results to within range of user's current city/viewport
      photonUrl += `&lat=${anchorLat}&lon=${anchorLng}&location_bias_scale=0.95`;
    }
    const photonPromise = fetch(photonUrl, { signal: abortSignal })
      .then(r => r.ok ? r.json() : { features: [] })
      .then(data => {
        if (data?.features && Array.isArray(data.features)) {
          data.features.forEach(f => {
            const coords = f.geometry?.coordinates;
            if (!coords || coords.length < 2) return;
            const lng = coords[0];
            const lat = coords[1];

            const p = f.properties || {};
            const name = p.name || '';
            const street = p.street || '';
            const locality = p.district || p.locality || '';
            const city = p.city || p.county || p.state || '';
            const country = p.country || '';
            // Check if anchor is in India (lat: 6-37.5, lng: 68-98)
            const isAnchorInIndia = anchorLat != null && anchorLng != null
              && anchorLat >= 6.0 && anchorLat <= 37.5
              && anchorLng >= 68.0 && anchorLng <= 98.0;

            // Only filter cross-border results if searching within India and no foreign country mentioned
            if (isAnchorInIndia && countryCode && countryCode !== 'in' && !raw.toLowerCase().includes(country.toLowerCase())) {
              return;
            }

            const isFood = ['restaurant', 'food_court', 'dhaba', 'fast_food', 'cafe', 'bar'].includes(p.osm_value) || p.osm_key === 'amenity';
            const isOffice = ['company', 'office', 'commercial'].includes(p.osm_value) || p.osm_key === 'office';

            const parts = [name, street, locality, city, country].filter(Boolean);
            const labelParts = [name, locality || street, city].filter(Boolean);
            const label = labelParts.slice(0, 3).join(', ') || name;

            addResult({
              label: label || name,
              fullAddress: parts.join(', '),
              city,
              lat,
              lng,
              category: isFood ? 'food' : (isOffice ? 'office' : 'landmark'),
              source: 'photon'
            });
          });
        }
      })
      .catch(() => {});
    remotePromises.push(photonPromise);
  } catch (_) {}

  // 2c. Location-Biased Nominatim Geocoder
  try {
    const isAnchorInIndia = anchorLat != null && anchorLng != null
      && anchorLat >= 6.0 && anchorLat <= 37.5
      && anchorLng >= 68.0 && anchorLng <= 98.0;

    let nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(effectiveQuery)}&limit=8&addressdetails=1`;
    if (isAnchorInIndia) {
      nomUrl += '&countrycodes=in';
    }
    if (anchorLat != null && anchorLng != null) {
      const minLon = (anchorLng - 0.75).toFixed(4);
      const maxLon = (anchorLng + 0.75).toFixed(4);
      const minLat = (anchorLat - 0.75).toFixed(4);
      const maxLat = (anchorLat + 0.75).toFixed(4);
      nomUrl += `&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=0`;
    }
    const nomPromise = fetch(nomUrl, {
      headers: { 'Accept': 'application/json' },
      signal: abortSignal
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          data.forEach(item => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            if (isNaN(lat) || isNaN(lng)) return;

            const addr = item.address || {};
            const placeName = addr.amenity || addr.shop || addr.building || addr.tourism || addr.leisure || '';
            const localPart = addr.suburb || addr.neighbourhood || addr.quarter || addr.road || '';
            const cityPart = addr.city || addr.town || addr.municipality || addr.state_district || addr.state || '';

            let label = '';
            if (placeName && (localPart || cityPart)) {
              label = `${placeName}, ${localPart || cityPart}`;
            } else if (localPart && cityPart) {
              label = `${localPart}, ${cityPart}`;
            } else {
              label = item.display_name.split(',').slice(0, 3).join(', ').trim();
            }

            const isFood = ['restaurant', 'dhaba', 'fast_food', 'cafe', 'food_court'].includes(item.type);
            const isOffice = ['office', 'commercial', 'industrial'].includes(item.type) || ['office', 'building'].includes(item.class);

            addResult({
              label,
              fullAddress: item.display_name,
              city: cityPart,
              lat,
              lng,
              category: isFood ? 'food' : (isOffice ? 'office' : 'landmark'),
              source: 'osm_nominatim'
            });
          });
        }
      })
      .catch(() => {});
    remotePromises.push(nomPromise);
  } catch (_) {}

  // Await all remote searches with a tight 1.5s race timeout
  await Promise.race([
    Promise.allSettled(remotePromises),
    new Promise(res => setTimeout(res, 1800))
  ]);

  // 3. Final Google Maps-Style Ranking & Sorting
  // Heavily reward places closest to current anchor (< 30km), followed by same metro (< 80km)
  allResults.sort((a, b) => {
    // If a place has source 'curated_local' with high score and nearby distance, keep at top
    const aDist = a.distanceKm != null ? a.distanceKm : 99999;
    const bDist = b.distanceKm != null ? b.distanceKm : 99999;

    // Proximity buckets
    const aIsNearby = aDist < 40;
    const bIsNearby = bDist < 40;

    if (aIsNearby && !bIsNearby) return -1;
    if (!aIsNearby && bIsNearby) return 1;

    // Within same proximity tier, sort by distance
    return aDist - bDist;
  });

  return allResults.slice(0, 15);
}
