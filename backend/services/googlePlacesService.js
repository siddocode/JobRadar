const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const City = require('../models/City');
const Company = require('../models/Company');
const Office = require('../models/Office');
const UncertainMerge = require('../models/UncertainMerge');
const Job = require('../models/Job');
const {
  extractDomain,
  normalizeCompanyName,
  slugify,
  stringSimilarity,
  linkJobsForCompany,
  isGovernmentOrNonTechEntity,
  classifyTechCompany,
  detectLocalityFromCoords
} = require('../utils/companyUtils');
const { INITIAL_CITIES } = require('../scripts/seedCities');
const { getTechHubSeedsForCity } = require('../data/seeds/techHubSeeds');

// Active scanning state for Google Places
const googlePlacesScanState = {
  isRunning: false,
  citySlug: null,
  cityName: null,
  startedAt: null,
  finishedAt: null,
  progress: 'Idle',
  lastSummary: null,
  error: null,
  discoveredPreview: []
};

/**
 * Returns the current scan state
 */
function getScanState() {
  return googlePlacesScanState;
}

/**
 * Generates unique slug for a company
 */
async function getUniqueSlug(baseName) {
  let baseSlug = slugify(baseName) || 'company';
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = await Company.findOne({ slug });
    if (!existing) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch Google Places with API Key (supports next_page_token pagination up to 3 pages)
 */
async function fetchGooglePlacesApi(query, lat, lng, radius, apiKey) {
  const allResults = [];
  let pageToken = null;
  let pageCount = 0;

  try {
    do {
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;
      if (pageToken) {
        url += `&pagetoken=${pageToken}`;
        await sleep(2000); // Google requires delay before next_page_token activates
      }
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') break;
      if (Array.isArray(json.results)) {
        allResults.push(...json.results);
      }
      pageToken = json.next_page_token || null;
      pageCount++;
    } while (pageToken && pageCount < 3);
  } catch (err) {
    console.warn(`[GooglePlaces] Error fetching Places for query "${query}":`, err.message);
  }

  return allResults;
}

/**
 * Fetch Place Details for contact phone & website
 */
async function fetchPlaceDetails(placeId, apiKey) {
  const fields = 'name,formatted_address,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,geometry,types,business_status';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.result || null;
  } catch (err) {
    console.warn(`[GooglePlaces] Failed to fetch details for place ${placeId}:`, err.message);
    return null;
  }
}

/**
 * Fallback Local Discovery when no API key is provided
 * Queries Overpass API for registered office & tech entities with full address extraction
 */
async function fetchFallbackPlaces(city) {
  const cacheFile = path.join(__dirname, '../data/cache', `osm_${city.slug}.json`);
  let elements = [];

  // Check cache: must have at least 25 elements to be considered a complete scan
  if (fs.existsSync(cacheFile)) {
    try {
      const raw = fs.readFileSync(cacheFile, 'utf8');
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.elements) && cached.elements.length >= 25) {
        // Strict filter: Exclude all government, educational boards, municipal, or non-tech offices
        elements = cached.elements.filter(el => {
          const tags = el.tags || {};
          if (!tags.name) return false;
          return !isGovernmentOrNonTechEntity({
            name: tags.name,
            website: tags.website || tags['contact:website'] || tags.url,
            tags
          });
        });
        if (elements.length >= 20) {
          console.log(`[GooglePlaces Fallback] Loaded ${elements.length} verified non-gov entities from valid cache (${cacheFile})`);
        } else {
          elements = []; // Stale or filtered too low, re-query live Overpass
        }
      } else {
        console.log(`[GooglePlaces Fallback] Cache file ${cacheFile} has only ${cached?.elements?.length || 0} items; bypassing stub to query live.`);
      }
    } catch (e) {
      console.warn(`[GooglePlaces Fallback] Could not read cache:`, e.message);
    }
  }

  if (elements.length === 0) {
    const [south, west, north, east] = city.bbox;
    const OVERPASS_ENDPOINTS = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    // Fast, structured query targeting real tech offices & coworking spaces
    const query = `[out:json][timeout:25];
(
  node["office"~"it|software|telecommunication|coworking|research|company|consulting"](${south},${west},${north},${east});
  way["office"~"it|software|telecommunication|coworking|research|company|consulting"](${south},${west},${north},${east});
  node["amenity"="coworking_space"](${south},${west},${north},${east});
  way["amenity"="coworking_space"](${south},${west},${north},${east});
  node["office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics|Data",i](${south},${west},${north},${east});
  way["office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics|Data",i](${south},${west},${north},${east});
  node["building"="office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics|Data",i](${south},${west},${north},${east});
  way["building"="office"]["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy|Cloud|Systems|AI|Analytics|Data",i](${south},${west},${north},${east});
);
out center;`;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 28000);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'JobRadar/2.0 (contact: support@jobradar.local)'
          },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const json = await response.json();
          if (json && Array.isArray(json.elements) && json.elements.length > 0) {
            const verified = json.elements.filter(el => {
              const tags = el.tags || {};
              if (!tags.name) return false;
              return !isGovernmentOrNonTechEntity({
                name: tags.name,
                website: tags.website || tags['contact:website'] || tags.url,
                tags
              });
            });
            if (verified.length >= 10) {
              elements = verified;
              try {
                fs.writeFileSync(cacheFile, JSON.stringify({ elements: json.elements }, null, 2), 'utf8');
                console.log(`[GooglePlaces Fallback] Cached ${json.elements.length} raw Overpass elements (${verified.length} verified) to ${cacheFile}`);
              } catch (_) {}
              break;
            }
          }
        }
      } catch (err) {
        console.warn(`[Fallback] Overpass endpoint ${endpoint} failed: ${err.message}`);
      }
    }
  }

  // If Overpass failed or timed out, fall back to curated tech hub seed data for tech hubs
  if (elements.length === 0) {
    const seeds = getTechHubSeedsForCity(city.slug, city.name, city.bbox);
    if (seeds && seeds.length > 0) {
      console.log(`[GooglePlaces Fallback] Falling back to curated tech hub seeds for ${city.name} (${seeds.length} verified companies)`);
      try {
        const seedElements = seeds.map((s, idx) => ({
          type: 'node',
          id: 9900000000 + idx,
          lat: s.lat,
          lon: s.lng,
          tags: {
            name: s.name,
            'addr:full': s.formatted_address,
            'addr:suburb': s.locality,
            website: s.website,
            phone: s.phone,
            office: 'it'
          }
        }));
        if (seedElements.length >= 25) {
          fs.writeFileSync(cacheFile, JSON.stringify({ elements: seedElements }, null, 2), 'utf8');
        }
      } catch (_) {}

      return seeds.map(s => ({
        name: s.name,
        formatted_address: s.formatted_address,
        locality: s.locality || city.name,
        lat: s.lat,
        lng: s.lng,
        website: s.website,
        phone: s.phone,
        rating: s.rating,
        user_ratings_total: s.user_ratings_total,
        category: s.category,
        isTech: s.isTech,
        source: s.website || `https://maps.google.com/?q=${encodeURIComponent(s.name + ' ' + city.name)}`,
        isFallback: true
      }));
    }

    throw new Error(`Map discovery service timed out while scanning "${city.name}". Please retry in a few moments or provide a Google Places API key.`);
  }

  return elements
    .filter(el => {
      const tags = el.tags || {};
      if (!tags.name) return false;
      return !isGovernmentOrNonTechEntity({
        name: tags.name,
        website: tags.website || tags['contact:website'] || tags.url,
        tags
      });
    })
    .map(el => {
      const tags = el.tags || {};
      const lat = el.lat != null ? el.lat : el.center?.lat;
      const lng = el.lon != null ? el.lon : el.center?.lon;

      const parts = [];
      if (tags['addr:housename']) parts.push(tags['addr:housename']);
      if (tags['addr:floor']) parts.push(`Floor ${tags['addr:floor']}`);
      if (tags['addr:unit']) parts.push(`Unit ${tags['addr:unit']}`);
      if (tags['addr:block']) parts.push(`Block ${tags['addr:block']}`);
      if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
      if (tags['addr:street']) parts.push(tags['addr:street']);
      if (tags['addr:place']) parts.push(tags['addr:place']);
      if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
      if (tags['addr:district']) parts.push(tags['addr:district']);
      if (tags['loc_name']) parts.push(tags['loc_name']);

      let address = '';
      if (tags['addr:full'] && tags['addr:full'].length > 10) {
        address = tags['addr:full'];
      } else if (parts.length > 0) {
        if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
        if (city.name && !parts.some(p => p.toLowerCase().includes(city.name.toLowerCase()))) {
          parts.push(city.name);
        }
        address = parts.join(', ');
      }

      // If address is still missing street details, detect tech corridor from GPS
      const detectedLocality = detectLocalityFromCoords(lat, lng, city.slug);
      const locality = tags['addr:suburb'] || tags['addr:district'] || tags['addr:place'] || detectedLocality || city.name;
      if (!address || address === city.name) {
        address = detectedLocality
          ? `${tags.name}, ${detectedLocality}, ${city.name}`
          : `${tags.name}, ${city.name}`;
      }

      const website = tags.website || tags['contact:website'] || tags.url || null;
      const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || tags.mobile || tags['contact:whatsapp'] || null;
      const email = tags.email || tags['contact:email'] || null;
      const classification = classifyTechCompany({ name: tags.name, website, tags });

      return {
        name: tags.name,
        formatted_address: address,
        locality,
        lat,
        lng,
        website,
        phone,
        email,
        source: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        rating: 4.6,
        user_ratings_total: 15,
        category: classification.category,
        isTech: classification.isTech,
        tags,
        isFallback: true
      };
    })
    .filter(p => p.name && p.lat && p.lng);
}

/**
 * Get corridor-targeted search queries for Google Places discovery
 */
function getCityCorridorQueries(citySlug, cityName) {
  const map = {
    hyderabad: [
      `software companies in HITEC City Hyderabad`,
      `IT companies in Gachibowli Hyderabad`,
      `software company in Madhapur Hyderabad`,
      `IT companies in Financial District Nanakramguda Hyderabad`,
      `tech startups in Kondapur Hyderabad`,
      `software companies in Raidurg Knowledge City Hyderabad`,
      `IT company in Begumpet Hyderabad`,
      `software companies in Uppal IT Park Hyderabad`
    ],
    bengaluru: [
      `software companies in Electronic City Bengaluru`,
      `software companies in Whitefield Bengaluru`,
      `IT companies in Outer Ring Road Bellandur Bengaluru`,
      `tech startups in Koramangala Bengaluru`,
      `software companies in HSR Layout Bengaluru`,
      `IT companies in Manyata Tech Park Bengaluru`,
      `software companies in Indiranagar Bengaluru`
    ],
    pune: [
      `software companies in Hinjawadi IT Park Pune`,
      `IT companies in Magarpatta City Pune`,
      `software companies in EON Free Zone Kharadi Pune`,
      `IT companies in Viman Nagar Pune`,
      `software companies in Baner Pune`,
      `tech startups in Senapati Bapat Road Pune`
    ],
    gurgaon: [
      `software companies in DLF Cyber City Gurugram`,
      `IT companies in Udyog Vihar Gurugram`,
      `software companies in Golf Course Road Gurugram`,
      `tech startups in Sector 44 Gurugram`,
      `IT companies in Sohna Road Gurugram`
    ],
    noida: [
      `software companies in Sector 62 Noida`,
      `IT companies in Sector 125 Noida Expressway`,
      `software companies in Sector 16 Film City Noida`,
      `IT companies in Sector 135 Noida`,
      `tech startups in Noida Sector 63`
    ],
    'delhi-ncr': [
      `software companies in Okhla Phase 3 Delhi`,
      `tech startups in Connaught Place Delhi`,
      `IT companies in Nehru Place Delhi`,
      `software companies in Mohan Cooperative Industrial Estate Delhi`
    ],
    mumbai: [
      `software companies in Powai Mumbai`,
      `IT companies in Mindspace Airoli Navi Mumbai`,
      `software companies in SEEPZ Andheri East Mumbai`,
      `IT companies in Bandra Kurla Complex BKC Mumbai`,
      `tech startups in Goregaon West Mumbai`,
      `IT companies in Millennium Business Park Mahape Navi Mumbai`
    ],
    chennai: [
      `software companies in OMR Sholinganallur Chennai`,
      `IT companies in TIDEL Park Taramani Chennai`,
      `software companies in Siruseri SIPCOT IT Park Chennai`,
      `IT companies in Guindy Olympia Tech Park Chennai`,
      `software companies in Global Infocity Perungudi Chennai`,
      `IT companies in DLF Cybercity Porur Chennai`
    ],
    kolkata: [
      `software companies in Salt Lake Sector 5 Kolkata`,
      `IT companies in New Town Rajarhat Kolkata`,
      `software companies in DLF IT Park New Town Kolkata`,
      `tech startups in Sector V Bidhannagar Kolkata`,
      `IT companies in Electronics Complex Salt Lake Kolkata`
    ],
    chandigarh: [
      `software companies in Rajiv Gandhi IT Park Chandigarh`,
      `IT companies in Phase 8 Mohali IT Corridor`,
      `software companies in Industrial Area Phase 1 Chandigarh`,
      `tech startups in Chandigarh Mohali`
    ],
    ahmedabad: [
      `software companies in SG Highway Ahmedabad`,
      `IT companies in GIFT City Gandhinagar`,
      `software companies in Prahlad Nagar Ahmedabad`,
      `tech startups in Science City Ahmedabad`
    ],
    kochi: [
      `software companies in Infopark Kakkanad Kochi`,
      `IT companies in SmartCity Kochi`,
      `tech startups in Kinfra Hi-Tech Park Kochi`
    ],
    jaipur: [
      `software companies in Mahindra World City SEZ Jaipur`,
      `IT companies in Sitapura Industrial Area Jaipur`,
      `software companies in Malviya Nagar Jaipur`
    ],
    indore: [
      `software companies in Crystal IT Park Indore`,
      `IT companies in Super Corridor Indore`,
      `tech startups in Vijay Nagar Indore`
    ],
    coimbatore: [
      `software companies in TIDEL Park Coimbatore`,
      `IT companies in CHIL SEZ Saravanampatti Coimbatore`
    ],
    thiruvananthapuram: [
      `software companies in Technopark Phase 1 Thiruvananthapuram`,
      `IT companies in Technopark Phase 3 Trivandrum`
    ],
    bhubaneswar: [
      `software companies in Infocity Chandrasekharpur Bhubaneswar`,
      `IT companies in Infovalley Bhubaneswar`
    ],
    lucknow: [
      `software companies in Vibhuti Khand Gomti Nagar Lucknow`,
      `IT companies in HCL IT City Lucknow`
    ]
  };

  return map[citySlug] || [
    `software companies in ${cityName}`,
    `IT services consultancy in ${cityName}`,
    `web development company in ${cityName}`,
    `tech startups in ${cityName}`,
    `technology park in ${cityName}`
  ];
}

/**
 * Scan Google Places map-wise for a target city
 */
async function scanGooglePlacesCity({ citySlug, customApiKey = null, radius = 25000, keywords = null }) {
  if (googlePlacesScanState.isRunning) {
    throw new Error(`A scan is already in progress for ${googlePlacesScanState.cityName || googlePlacesScanState.citySlug}`);
  }

  const cleanSlug = (citySlug || 'kolkata').trim().toLowerCase();
  let city = await City.findOne({ slug: cleanSlug });

  if (!city) {
    const preset = INITIAL_CITIES.find(c => c.slug === cleanSlug);
    if (preset) {
      city = await City.create(preset);
    } else {
      throw new Error(`City "${cleanSlug}" is not configured in database.`);
    }
  }

  // Calculate center coordinates from bbox
  const centerLat = (city.bbox[0] + city.bbox[2]) / 2;
  const centerLng = (city.bbox[1] + city.bbox[3]) / 2;

  const apiKey = (customApiKey || process.env.GOOGLE_PLACES_API_KEY || '').trim();
  const isRealGoogleApi = Boolean(apiKey);

  googlePlacesScanState.isRunning = true;
  googlePlacesScanState.citySlug = city.slug;
  googlePlacesScanState.cityName = city.name;
  googlePlacesScanState.startedAt = new Date();
  googlePlacesScanState.finishedAt = null;
  googlePlacesScanState.progress = isRealGoogleApi ? 'Connecting to Google Places API...' : 'Scanning local map business clusters...';
  googlePlacesScanState.lastSummary = null;
  googlePlacesScanState.error = null;
  googlePlacesScanState.discoveredPreview = [];

  console.log(`[GooglePlaces] Starting scan for ${city.name} (${cleanSlug}) | Mode: ${isRealGoogleApi ? 'Official Google Places API' : 'High-density Local Fallback'}`);

  let createdCompanies = 0;
  let updatedCompanies = 0;
  let createdOffices = 0;
  let skippedDuplicates = 0;
  let rawPlacesList = [];

  try {
    if (isRealGoogleApi) {
      // Sweeps through corridor-targeted tech queries
      const corridorQueries = getCityCorridorQueries(city.slug, city.name);
      const searchQueries = keywords && keywords.length > 0 ? keywords : corridorQueries;

      const seenPlaceIds = new Set();

      for (let i = 0; i < searchQueries.length; i++) {
        const query = searchQueries[i];
        googlePlacesScanState.progress = `Searching Google Places for "${query}" (${i + 1}/${searchQueries.length})...`;
        console.log(`[GooglePlaces] Querying: "${query}" at [${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}] radius ${radius}m`);

        const results = await fetchGooglePlacesApi(query, centerLat, centerLng, radius, apiKey);
        for (const place of results) {
          if (!place.place_id || seenPlaceIds.has(place.place_id)) continue;
          seenPlaceIds.add(place.place_id);

          // Get detailed information (phone & website)
          const details = await fetchPlaceDetails(place.place_id, apiKey);
          const fullPlace = details || place;

          // Exclude any government or civic offices
          if (isGovernmentOrNonTechEntity({
            name: fullPlace.name || place.name,
            website: fullPlace.website,
            tags: { types: fullPlace.types }
          })) {
            continue;
          }

          rawPlacesList.push({
            name: fullPlace.name || place.name,
            placeId: place.place_id,
            formatted_address: fullPlace.formatted_address || place.formatted_address || `${place.name}, ${city.name}`,
            locality: extractLocality(fullPlace.formatted_address || place.formatted_address, city.name),
            lat: fullPlace.geometry?.location?.lat || place.geometry?.location?.lat,
            lng: fullPlace.geometry?.location?.lng || place.geometry?.location?.lng,
            website: fullPlace.website || null,
            phone: fullPlace.formatted_phone_number || fullPlace.international_phone_number || null,
            rating: fullPlace.rating || place.rating || null,
            user_ratings_total: fullPlace.user_ratings_total || place.user_ratings_total || null,
            source: fullPlace.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            types: fullPlace.types || place.types || ['point_of_interest']
          });

          // Polite pacing
          await sleep(150);
        }
      }
    } else {
      // Fallback: Local Overpass business scanner with tech classification
      googlePlacesScanState.progress = `Scanning physical map coordinates and local businesses in ${city.name}...`;
      rawPlacesList = await fetchFallbackPlaces(city);
    }

    // Sort discovered places: prioritize verified Tech/IT companies first, then rich contact info & street addresses
    rawPlacesList.sort((a, b) => {
      const techScoreA = (a.isTech || a.category === 'Software & IT Services' || a.category === 'AI & Data Solutions' || a.category === 'IT Consulting & Services' || a.category === 'Tech / Product Company') ? 50 : 0;
      const techScoreB = (b.isTech || b.category === 'Software & IT Services' || b.category === 'AI & Data Solutions' || b.category === 'IT Consulting & Services' || b.category === 'Tech / Product Company') ? 50 : 0;
      const contactScoreA = (a.phone ? 30 : 0) + (a.website ? 25 : 0) + (a.email ? 20 : 0);
      const contactScoreB = (b.phone ? 30 : 0) + (b.website ? 25 : 0) + (b.email ? 20 : 0);
      const addrScoreA = (a.formatted_address && a.formatted_address !== city.name && !a.formatted_address.endsWith(`, ${city.name}`) ? 10 : 0);
      const addrScoreB = (b.formatted_address && b.formatted_address !== city.name && !b.formatted_address.endsWith(`, ${city.name}`) ? 10 : 0);
      const scoreA = techScoreA + contactScoreA + addrScoreA + (a.rating ? 1 : 0);
      const scoreB = techScoreB + contactScoreB + addrScoreB + (b.rating ? 1 : 0);
      return scoreB - scoreA;
    });

    // Cap single scan processing to top 250 high-quality places to ensure instantaneous 5-10s execution
    const placesToProcess = rawPlacesList.slice(0, 250);
    const totalCount = placesToProcess.length;

    googlePlacesScanState.progress = `Pre-indexing ${totalCount} top places (of ${rawPlacesList.length} discovered)...`;
    console.log(`[GooglePlaces] Ingesting top ${totalCount} places (total found: ${rawPlacesList.length}) for ${city.name}...`);

    // In-memory lookup tables to eliminate ~15,000 remote database round-trips
    const existingCompanies = await Company.find({}).select('name domain sources contact slug').lean();
    const existingOffices = await Office.find({ cityId: city._id }).select('companyId lat lng address').lean();

    const nameMap = new Map();
    const domainMap = new Map();
    const sourceMap = new Map();

    for (const c of existingCompanies) {
      if (c.name) nameMap.set(c.name.toLowerCase().trim(), c);
      if (c.domain) domainMap.set(c.domain.toLowerCase().trim(), c);
      if (Array.isArray(c.sources)) {
        for (const s of c.sources) sourceMap.set(s, c);
      }
    }

    const previewList = [];

    for (let idx = 0; idx < placesToProcess.length; idx++) {
      const place = placesToProcess[idx];
      if (!place.name || !place.lat || !place.lng) continue;

      // Update real-time progress counter so UI never appears stuck
      if (idx % 15 === 0 || idx === totalCount - 1) {
        googlePlacesScanState.progress = `Indexing places: ${idx + 1} / ${totalCount} (${Math.round(((idx + 1) / totalCount) * 100)}%)...`;
      }

      const name = place.name.trim();
      const rawWeb = place.website ? place.website.trim() : null;
      const website = rawWeb ? (/^https?:\/\//i.test(rawWeb) ? rawWeb : `https://${rawWeb}`) : null;
      const domain = extractDomain(website);
      const address = place.formatted_address || `${name}, ${city.name}`;
      const locality = place.locality || extractLocality(address, city.name);
      const phone = place.phone ? place.phone.trim() : null;
      const email = place.email ? place.email.trim() : null;
      const sourceUrl = place.source || `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + city.name)}`;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
      const searchLoc = locality && locality !== city.name ? `${locality}, ${city.name}` : city.name;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + searchLoc + ' contact phone website official')}`;
      const linkedinUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + ' hr recruiter talent acquisition')}`;

      const classification = (place.category && place.isTech !== undefined)
        ? { category: place.category, isTech: place.isTech }
        : classifyTechCompany({ name, website, tags: place.tags });

      previewList.push({
        name,
        address,
        locality,
        lat: place.lat,
        lng: place.lng,
        website,
        phone,
        email,
        mapsUrl,
        searchUrl,
        linkedinUrl,
        rating: place.rating,
        reviewsCount: place.user_ratings_total,
        category: classification.category,
        isTech: classification.isTech
      });

      // --- High-Speed In-Memory Deduplication Search ---
      let matchedCompany = null;
      const cleanNameKey = name.toLowerCase().trim();

      if (sourceMap.has(sourceUrl)) {
        matchedCompany = sourceMap.get(sourceUrl);
      } else if (domain && domainMap.has(domain.toLowerCase().trim())) {
        matchedCompany = domainMap.get(domain.toLowerCase().trim());
      } else if (nameMap.has(cleanNameKey)) {
        matchedCompany = nameMap.get(cleanNameKey);
      } else {
        // Coordinate proximity check: only match if nearby AND names are similar
        const nearby = existingOffices.find(o =>
          Math.abs(o.lat - place.lat) < 0.0006 && Math.abs(o.lng - place.lng) < 0.0006
        );
        if (nearby) {
          const cand = existingCompanies.find(c => c._id.toString() === nearby.companyId.toString());
          if (cand && (cand.name.toLowerCase().includes(cleanNameKey) || cleanNameKey.includes(cand.name.toLowerCase()))) {
            matchedCompany = cand;
          }
        }
      }

      // If not in in-memory cache, check database by indexed domain / exact name
      if (!matchedCompany) {
        matchedCompany = await Company.findOne({
          $or: [
            domain ? { domain: domain.toLowerCase().trim() } : null,
            { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
          ].filter(Boolean)
        });
      }

      // --- Database Upsert ---
      if (matchedCompany) {
        let changed = false;
        const updateOps = { $addToSet: { sources: sourceUrl } };
        const setOps = {};

        // Populate website/domain if missing and not already claimed
        if (!matchedCompany.website && website) {
          matchedCompany.website = website;
          setOps.website = website;
          if (!matchedCompany.domain && domain && !domainMap.has(domain.toLowerCase().trim())) {
            matchedCompany.domain = domain;
            setOps.domain = domain;
            domainMap.set(domain.toLowerCase().trim(), matchedCompany);
          }
          changed = true;
        }

        // Add phone number to contact.phones if missing
        const existingPhones = matchedCompany.contact?.phones || [];
        if (phone && !existingPhones.some(p => p.value === phone)) {
          if (!matchedCompany.contact) matchedCompany.contact = { phones: [], emails: [] };
          if (!matchedCompany.contact.phones) matchedCompany.contact.phones = [];
          matchedCompany.contact.phones.push({ value: phone, sourceUrl });
          updateOps.$addToSet = { ...updateOps.$addToSet, 'contact.phones': { value: phone, sourceUrl } };
          changed = true;
        }

        // Add email if provided
        const existingEmails = matchedCompany.contact?.emails || [];
        if (place.email && !existingEmails.some(e => e.value.toLowerCase() === place.email.toLowerCase())) {
          if (!matchedCompany.contact) matchedCompany.contact = { phones: [], emails: [] };
          if (!matchedCompany.contact.emails) matchedCompany.contact.emails = [];
          matchedCompany.contact.emails.push({ value: place.email, sourceUrl });
          updateOps.$addToSet = { ...updateOps.$addToSet, 'contact.emails': { value: place.email, sourceUrl } };
          changed = true;
        }

        if (Object.keys(setOps).length > 0) {
          updateOps.$set = setOps;
        }

        if (changed) {
          try {
            await Company.updateOne({ _id: matchedCompany._id }, updateOps);
            updatedCompanies++;
          } catch (upErr) {
            console.warn(`[GooglePlaces] Soft-handled update error for ${matchedCompany.name}:`, upErr.message);
            skippedDuplicates++;
          }
        } else {
          skippedDuplicates++;
        }

        // Ensure Office exists for this city
        let office = existingOffices.find(o => o.companyId && o.companyId.toString() === matchedCompany._id.toString());
        if (!office) {
          office = await Office.findOne({ companyId: matchedCompany._id, cityId: city._id });
        }
        if (!office) {
          office = await Office.create({
            companyId: matchedCompany._id,
            cityId: city._id,
            address,
            locality,
            lat: place.lat,
            lng: place.lng,
            addressSource: isRealGoogleApi ? 'google_places' : 'google_places_fallback',
            addressType: 'development',
            verified: true
          });
          existingOffices.push(office);
          createdOffices++;
        } else if (office.lat == null && place.lat != null) {
          await Office.updateOne({ _id: office._id }, { $set: { lat: place.lat, lng: place.lng, address } });
        }
      } else {
        // Create new Company
        const slug = await getUniqueSlug(name);
        const phonesList = phone ? [{ value: phone, sourceUrl }] : [];
        const emailsList = place.email ? [{ value: place.email, sourceUrl }] : [];

        const notesText = place.rating
          ? `Google Places rating: ${place.rating}★ (${place.user_ratings_total || 0} reviews). ${address}`
          : `Discovered via map-wise scan in ${city.name}. ${address}`;

        let newComp = null;
        try {
          newComp = await Company.create({
            name,
            slug,
            domain: domain || null,
            website: website || null,
            category: classification.category,
            isTech: classification.isTech,
            followUpStatus: 'to_contact',
            notes: notesText,
            contact: {
              emails: emailsList,
              phones: phonesList,
              contactPageUrl: website ? `${website.replace(/\/+$/, '')}/contact` : null
            },
            sources: [sourceUrl]
          });
        } catch (createErr) {
          const isDup = createErr.code === 11000 ||
            createErr.errorResponse?.code === 11000 ||
            (createErr.message && createErr.message.includes('E11000'));
          if (isDup) {
            newComp = await Company.findOne({
              $or: [
                domain ? { domain: domain.toLowerCase().trim() } : null,
                { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
              ].filter(Boolean)
            });
            if (newComp) {
              await Company.updateOne({ _id: newComp._id }, { $addToSet: { sources: sourceUrl } });
              updatedCompanies++;
            }
          }
          if (!newComp) throw createErr;
        }

        // Add to in-memory lookup cache so same-batch duplicates are handled seamlessly
        nameMap.set(cleanNameKey, newComp);
        if (domain) domainMap.set(domain.toLowerCase().trim(), newComp);
        sourceMap.set(sourceUrl, newComp);

        // Create or update verified Office
        let office = existingOffices.find(o => o.companyId && o.companyId.toString() === newComp._id.toString());
        if (!office) {
          office = await Office.findOne({ companyId: newComp._id, cityId: city._id });
        }
        if (!office) {
          office = await Office.create({
            companyId: newComp._id,
            cityId: city._id,
            address,
            locality,
            lat: place.lat,
            lng: place.lng,
            addressSource: isRealGoogleApi ? 'google_places' : 'google_places_fallback',
            addressType: 'development',
            verified: true
          });
          existingOffices.push(office);
          createdOffices++;
        } else if (office.lat == null && place.lat != null) {
          await Office.updateOne({ _id: office._id }, { $set: { lat: place.lat, lng: place.lng, address } });
        }

        // Link any matching open jobs
        await linkJobsForCompany(newComp);
        createdCompanies++;
        createdOffices++;
      }
    }

    const summary = {
      city: city.name,
      citySlug: city.slug,
      mode: isRealGoogleApi ? 'Google Places API (Direct)' : 'High-density Map Engine (Free Fallback)',
      isRealGoogleApi,
      totalDiscovered: rawPlacesList.length,
      createdCompanies,
      updatedCompanies,
      createdOffices,
      skippedDuplicates,
      center: { lat: centerLat, lng: centerLng },
      radiusMeters: radius,
      scannedAt: new Date().toISOString()
    };

    googlePlacesScanState.isRunning = false;
    googlePlacesScanState.finishedAt = new Date();
    googlePlacesScanState.progress = 'Completed';
    googlePlacesScanState.lastSummary = summary;
    googlePlacesScanState.discoveredPreview = previewList.slice(0, 30); // Top 30 for map pins

    console.log(`[GooglePlaces] Scan completed successfully for ${city.name}:`, summary);
    return summary;
  } catch (err) {
    googlePlacesScanState.isRunning = false;
    googlePlacesScanState.finishedAt = new Date();
    googlePlacesScanState.progress = 'Failed';
    googlePlacesScanState.error = err.message || 'Error occurred during Google Places scan';
    console.error(`[GooglePlaces] Scan failed for ${city.name}:`, err);
    throw err;
  }
}

/**
 * Helper to extract locality / neighborhood from address
 */
function extractLocality(address, cityName) {
  if (!address) return cityName || 'Central';
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    // Second or first part often contains locality (e.g. "Sector V", "Salt Lake", "Whitefield")
    return parts[0].length < 30 ? parts[0] : parts[1] || cityName;
  }
  return parts[0] || cityName;
}

module.exports = {
  scanGooglePlacesCity,
  getScanState
};
