const techHubCorridors = require('../config/techHubCorridors.json');

/**
 * Calculates great-circle distance between two GPS coordinates using the Haversine formula
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number|null} distance in kilometers rounded to 1 decimal place, or null if coordinates are invalid
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = parseFloat(lat1);
  const numLon1 = parseFloat(lon1);
  const numLat2 = parseFloat(lat2);
  const numLon2 = parseFloat(lon2);

  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // Earth radius in km
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

/**
 * Resolves best available coordinates for a job or office
 * @param {Object} item 
 * @returns {{ lat: number, lng: number }|null}
 */
function resolveItemCoordinates(item) {
  if (!item) return null;

  // 1. Direct coordinates
  if (item.coordinates && typeof item.coordinates.lat === 'number' && typeof item.coordinates.lng === 'number') {
    return { lat: item.coordinates.lat, lng: item.coordinates.lng };
  }
  if (typeof item.latitude === 'number' && typeof item.longitude === 'number') {
    return { lat: item.latitude, lng: item.longitude };
  }
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return { lat: item.lat, lng: item.lng };
  }

  // 2. Tech Corridor center
  if (item.city && item.techCorridor && techHubCorridors.cities) {
    const cityData = findCityData(item.city);
    if (cityData?.corridors && cityData.corridors[item.techCorridor]?.center) {
      return cityData.corridors[item.techCorridor].center;
    }
  }

  // 3. City center
  if (item.city && techHubCorridors.cities) {
    const cityData = findCityData(item.city);
    if (cityData?.center) {
      return cityData.center;
    }
  }

  return null;
}

function findCityData(cityName) {
  if (!cityName || !techHubCorridors.cities) return null;
  const lower = cityName.toLowerCase().trim();
  for (const [name, data] of Object.entries(techHubCorridors.cities)) {
    if (name.toLowerCase() === lower) return data;
    if (lower === 'bangalore' && name.toLowerCase() === 'bengaluru') return data;
    if (lower === 'gurgaon' && name.toLowerCase() === 'gurugram') return data;
    if ((lower === 'delhi' || lower === 'delhi ncr' || lower === 'delhi-ncr') && name.toLowerCase() === 'delhi ncr') return data;
  }
  return null;
}

module.exports = {
  calculateDistanceKm,
  resolveItemCoordinates
};
