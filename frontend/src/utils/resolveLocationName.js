// ============================================================================
// JOBRADAR — DETERMINISTIC GEOGRAPHIC & LOCATION RESOLVER
// Resolves coordinates and location strings to human-readable names.
// Prevents displaying raw coordinates like "Location (22.5643, 88.3693)".
// ============================================================================

export const POPULAR_INDIAN_METROS = [
  { name: 'Central Kolkata', city: 'Kolkata', state: 'West Bengal', lat: 22.5643, lng: 88.3693, maxKm: 8 },
  { name: 'Salt Lake Sector V', city: 'Kolkata', state: 'West Bengal', lat: 22.5804, lng: 88.4378, maxKm: 5 },
  { name: 'New Town Action Area', city: 'Kolkata', state: 'West Bengal', lat: 22.5867, lng: 88.4734, maxKm: 6 },
  { name: 'Kolkata', city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, maxKm: 35 },
  { name: 'Koramangala', city: 'Bengaluru', state: 'Karnataka', lat: 12.9352, lng: 77.6245, maxKm: 5 },
  { name: 'HSR Layout', city: 'Bengaluru', state: 'Karnataka', lat: 12.9121, lng: 77.6446, maxKm: 5 },
  { name: 'Whitefield / ITPL', city: 'Bengaluru', state: 'Karnataka', lat: 12.9856, lng: 77.7489, maxKm: 6 },
  { name: 'Outer Ring Road (Bellandur)', city: 'Bengaluru', state: 'Karnataka', lat: 12.9304, lng: 77.6850, maxKm: 6 },
  { name: 'Electronic City', city: 'Bengaluru', state: 'Karnataka', lat: 12.8457, lng: 77.6679, maxKm: 6 },
  { name: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', lat: 12.9784, lng: 77.6408, maxKm: 5 },
  { name: 'Bengaluru', city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, maxKm: 40 },
  { name: 'HITEC City', city: 'Hyderabad', state: 'Telangana', lat: 17.4483, lng: 78.3915, maxKm: 5 },
  { name: 'Gachibowli', city: 'Hyderabad', state: 'Telangana', lat: 17.4401, lng: 78.3489, maxKm: 6 },
  { name: 'Hyderabad', city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867, maxKm: 40 },
  { name: 'DLF Cyber City', city: 'Gurugram', state: 'Haryana', lat: 28.4950, lng: 77.0890, maxKm: 5 },
  { name: 'Golf Course Road', city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0988, maxKm: 5 },
  { name: 'Gurugram', city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266, maxKm: 30 },
  { name: 'Sector 62', city: 'Noida', state: 'Uttar Pradesh', lat: 28.6279, lng: 77.3649, maxKm: 5 },
  { name: 'Noida Expressway', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5100, lng: 77.3800, maxKm: 6 },
  { name: 'Noida', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.3910, maxKm: 30 },
  { name: 'Central Delhi', city: 'Delhi NCR', state: 'Delhi', lat: 28.6139, lng: 77.2090, maxKm: 35 },
  { name: 'BKC', city: 'Mumbai', state: 'Maharashtra', lat: 19.0660, lng: 72.8680, maxKm: 5 },
  { name: 'Lower Parel', city: 'Mumbai', state: 'Maharashtra', lat: 18.9950, lng: 72.8300, maxKm: 5 },
  { name: 'Andheri East', city: 'Mumbai', state: 'Maharashtra', lat: 19.1150, lng: 72.8650, maxKm: 6 },
  { name: 'Mumbai', city: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777, maxKm: 40 },
  { name: 'Hinjawadi IT Park', city: 'Pune', state: 'Maharashtra', lat: 18.5913, lng: 73.7389, maxKm: 6 },
  { name: 'Magarpatta / Kharadi', city: 'Pune', state: 'Maharashtra', lat: 18.5350, lng: 73.9400, maxKm: 6 },
  { name: 'Pune', city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, maxKm: 35 },
  { name: 'OMR Tech Corridor', city: 'Chennai', state: 'Tamil Nadu', lat: 12.9150, lng: 80.2280, maxKm: 7 },
  { name: 'Chennai', city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, maxKm: 35 },
  { name: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, maxKm: 35 },
  { name: 'Jaipur', city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, maxKm: 35 },
  { name: 'Kochi', city: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, maxKm: 30 },
  { name: 'Chandigarh', city: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794, maxKm: 30 }
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the curated metro/hub centroid closest to a coordinate pair.
 * Returns null when the coordinates are not valid numbers.
 */
export function findNearestMetro(lat, lng) {
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;

  let closest = null;
  let minDistance = Infinity;
  for (const metro of POPULAR_INDIAN_METROS) {
    const d = haversineKm(numLat, numLng, metro.lat, metro.lng);
    if (d < minDistance) {
      minDistance = d;
      closest = metro;
    }
  }

  if (!closest) return null;
  return { metro: closest, distanceKm: minDistance };
}

/**
 * The canonical label a metro/hub centroid produces, e.g. "Salt Lake Sector V, Kolkata".
 */
export function metroDisplayLabel(metro) {
  if (!metro) return '';
  return metro.name === metro.city
    ? `${metro.city}, ${metro.state}`
    : `${metro.name}, ${metro.city}`;
}

/**
 * Returns a human-readable name for coordinates or cleans an existing label.
 * NEVER returns raw coordinates like "Location (22.5643, 88.3693)".
 *
 * `approximate` is true when the label had to be derived from the curated metro
 * table instead of a real reverse-geocoder response. Callers use it to warn the
 * user that the *name* is coarse even though the coordinates are exact.
 */
export function resolveLocationName(lat, lng, rawLabel = '', rawCity = '') {
  // If rawLabel is already a legitimate name (not coordinates / Pinned Point / Location (..))
  const isRawCoordPattern = /^(Location|Pinned Point)?\s*\(?-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\)?$/i;
  if (rawLabel && !isRawCoordPattern.test(rawLabel.trim())) {
    const cleaned = rawLabel.replace(/^Location\s*\([^)]*\)\s*:\s*/i, '').trim();
    if (cleaned.length > 2 && !/^\d+(\.\d+)?$/.test(cleaned)) {
      return {
        label: cleaned,
        city: rawCity || cleaned.split(',')[0].trim(),
        approximate: false
      };
    }
  }

  // If rawCity is provided and clean
  if (rawCity && !isRawCoordPattern.test(rawCity.trim()) && rawCity.trim().length > 1) {
    return {
      label: `${rawCity}, India`,
      city: rawCity,
      approximate: false
    };
  }

  // Calculate distance to nearest Indian Metro centroid
  const nearest = findNearestMetro(lat, lng);
  if (nearest) {
    const { metro: closest, distanceKm: minDistance } = nearest;

    if (minDistance <= (closest.maxKm || 35)) {
      return {
        label: metroDisplayLabel(closest),
        city: closest.city,
        approximate: true,
        hub: closest.name
      };
    }

    if (minDistance <= 80) {
      return {
        label: `${closest.city} Region, India`,
        city: closest.city,
        approximate: true,
        hub: closest.name
      };
    }
  }

  // Never invent a city. If the coordinates are outside the known hub table
  // keep the caller's own text or a neutral label instead of falsely claiming
  // the user is in Kolkata.
  if (rawCity && rawCity.trim().length > 1) {
    return { label: rawCity.trim(), city: rawCity.trim(), approximate: true };
  }
  if (lat != null && lng != null && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
    return { label: 'Pinned location', city: '', approximate: true };
  }
  return { label: 'Location not set', city: '', approximate: true };
}

/**
 * Short label for compact navbar badges and action buttons
 */
export function getShortLocationLabel(userLocation) {
  if (!userLocation) return 'Set Location';
  const resolved = resolveLocationName(userLocation.lat, userLocation.lng, userLocation.label, userLocation.city);
  return resolved.city || resolved.label.split(',')[0].trim();
}

