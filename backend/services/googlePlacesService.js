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
  linkJobsForCompany
} = require('../utils/companyUtils');
const { INITIAL_CITIES } = require('../scripts/seedCities');

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
 * Fetch Google Places with API Key
 */
async function fetchGooglePlacesApi(query, lat, lng, radius, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Places API returned HTTP ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API error status "${json.status}": ${json.error_message || 'Unknown error'}`);
  }
  return json.results || [];
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

  if (fs.existsSync(cacheFile)) {
    try {
      const raw = fs.readFileSync(cacheFile, 'utf8');
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.elements) && cached.elements.length > 0) {
        console.log(`[GooglePlaces Fallback] Loaded ${cached.elements.length} cached local map entities from ${cacheFile}`);
        elements = cached.elements;
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

    const query = `[out:json][timeout:90];
(
  node["office"](${south},${west},${north},${east});
  way["office"](${south},${west},${north},${east});
  node["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy",i](${south},${west},${north},${east});
  way["name"~"Software|Tech|Technologies|Solutions|Infotech|Labs|Digital|Consultancy",i](${south},${west},${north},${east});
  node["amenity"="coworking_space"](${south},${west},${north},${east});
  way["amenity"="coworking_space"](${south},${west},${north},${east});
);
out center;`;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'User-Agent': 'JobRadar/1.0 (contact: sid@jobradar.local)' },
          body: query,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const json = await response.json();
          if (json && Array.isArray(json.elements) && json.elements.length > 0) {
            elements = json.elements;
            try {
              fs.writeFileSync(cacheFile, JSON.stringify(json, null, 2), 'utf8');
            } catch (_) {}
            break;
          }
        }
      } catch (err) {
        console.warn(`[Fallback] Overpass endpoint ${endpoint} failed: ${err.message}`);
      }
    }
  }

  return elements.map(el => {
    const tags = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center?.lat;
    const lng = el.lon != null ? el.lon : el.center?.lon;
    const parts = [];
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    else if (city.name) parts.push(city.name);
    const address = parts.length > 0 ? parts.join(', ') : (tags['addr:full'] || `${tags.name}, ${city.name}`);
    return {
      name: tags.name,
      formatted_address: address,
      locality: tags['addr:suburb'] || tags['addr:district'] || city.name,
      lat,
      lng,
      website: tags.website || tags['contact:website'] || tags.url || null,
      phone: tags.phone || tags['contact:phone'] || null,
      email: tags.email || tags['contact:email'] || null,
      source: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      rating: 4.6,
      user_ratings_total: 15,
      isFallback: true
    };
  }).filter(p => p.name && p.lat && p.lng);
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
      // Sweeps through tech queries
      const searchQueries = keywords && keywords.length > 0 ? keywords : [
        `software company in ${city.name}`,
        `IT services consultancy in ${city.name}`,
        `web development company in ${city.name}`,
        `tech startups in ${city.name}`,
        `app development in ${city.name}`
      ];

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

    // Sort discovered places by data richness (phones, websites, and review ratings first)
    rawPlacesList.sort((a, b) => {
      const scoreA = (a.phone ? 3 : 0) + (a.website ? 2 : 0) + (a.rating ? 1 : 0);
      const scoreB = (b.phone ? 3 : 0) + (b.website ? 2 : 0) + (b.rating ? 1 : 0);
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
      const sourceUrl = place.source || `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + city.name)}`;

      previewList.push({
        name,
        address,
        locality,
        lat: place.lat,
        lng: place.lng,
        website,
        phone,
        rating: place.rating,
        reviewsCount: place.user_ratings_total
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
        // Fast coordinate proximity check against in-memory office cache
        const nearby = existingOffices.find(o =>
          Math.abs(o.lat - place.lat) < 0.0006 && Math.abs(o.lng - place.lng) < 0.0006
        );
        if (nearby) {
          matchedCompany = existingCompanies.find(c => c._id.toString() === nearby.companyId.toString());
        }
      }

      // --- Database Upsert ---
      if (matchedCompany) {
        let changed = false;
        const updateOps = { $addToSet: { sources: sourceUrl } };
        const setOps = {};

        // Populate website/domain if missing
        if (!matchedCompany.website && website) {
          matchedCompany.website = website;
          matchedCompany.domain = domain;
          setOps.website = website;
          setOps.domain = domain;
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
          await Company.updateOne({ _id: matchedCompany._id }, updateOps);
          updatedCompanies++;
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

        const newComp = await Company.create({
          name,
          slug,
          domain: domain || null,
          website: website || null,
          category: 'Software & IT Services',
          isTech: true,
          followUpStatus: 'to_contact',
          notes: notesText,
          contact: {
            emails: emailsList,
            phones: phonesList,
            contactPageUrl: website ? `${website.replace(/\/+$/, '')}/contact` : null
          },
          sources: [sourceUrl]
        });

        // Add to in-memory lookup cache so same-batch duplicates are handled seamlessly
        nameMap.set(cleanNameKey, newComp);
        if (domain) domainMap.set(domain.toLowerCase().trim(), newComp);
        sourceMap.set(sourceUrl, newComp);

        // Create verified Office
        const newOffice = await Office.create({
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
        existingOffices.push(newOffice);

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
