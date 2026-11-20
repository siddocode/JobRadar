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

// Curated high-frequency Indian tech hubs, business clusters, corporate towers, eateries & landmarks
export const CURATED_PLACES = [
  // --- KOLKATA ---
  {
    label: 'Technopolis IT Hub, BP Block, Sector V',
    fullAddress: 'Plot BP-4, Sector V, Bidhannagar, Salt Lake, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5798,
    lng: 88.4368,
    category: 'office',
    aliases: ['technopolis', 'technopolis sector 5', 'technopolis sector v', 'technopolis kolkata', 'bp block sector 5']
  },
  {
    label: 'Ecospace Business Park, New Town',
    fullAddress: 'Plot IIF/11, Action Area II, New Town, Rajarhat, Kolkata, West Bengal 700160',
    locality: 'New Town Action Area II',
    city: 'Kolkata',
    lat: 22.5892,
    lng: 88.4902,
    category: 'office',
    aliases: ['ecospace', 'ecospace business park', 'ecospace new town', 'new town ecospace']
  },
  {
    label: 'Infinity Benchmark, GP Block, Sector V',
    fullAddress: 'Plot G1, Block EP & GP, Sector V, Bidhannagar, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5698,
    lng: 88.4335,
    category: 'office',
    aliases: ['infinity benchmark', 'infinity think tank', 'gp block sector 5', 'infinity sector v']
  },
  {
    label: 'Godrej Waterside, DP Block, Sector V',
    fullAddress: 'Plot 5, Block DP, Sector V, Bidhannagar, Salt Lake, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5736,
    lng: 88.4425,
    category: 'office',
    aliases: ['godrej waterside', 'dp block sector 5', 'waterside sector v']
  },
  {
    label: 'Bengal Eco Intelligent Park (Techna), Sector V',
    fullAddress: 'Plot EM-3, EM Block, Sector V, Bidhannagar, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5705,
    lng: 88.4295,
    category: 'office',
    aliases: ['eco intelligent park', 'bengal eco intelligent park', 'techna building', 'em block sector 5']
  },
  {
    label: 'SDF Building & Webel IT Park, Sector V',
    fullAddress: 'SDF Building, GP Block, Sector V, Bidhannagar, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5691,
    lng: 88.4316,
    category: 'office',
    aliases: ['sdf building', 'webel', 'webel bhavan', 'webel it park', 'sdf sector 5']
  },
  {
    label: 'Mani Casadona IT Park, New Town',
    fullAddress: 'Plot IIF/04, Action Area IIF, New Town, Rajarhat, Kolkata, West Bengal 700156',
    locality: 'New Town Action Area II',
    city: 'Kolkata',
    lat: 22.5872,
    lng: 88.4810,
    category: 'office',
    aliases: ['mani casadona', 'casadona new town', 'mani casadona it park']
  },
  {
    label: 'Merlin Infinite, DN Block, Sector V',
    fullAddress: 'Plot DN-51, Sector V, Bidhannagar, Salt Lake, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5785,
    lng: 88.4342,
    category: 'office',
    aliases: ['merlin infinite', 'dn 51 sector 5', 'merlin sector v']
  },
  {
    label: 'Globsyn Crystals, EP Block, Sector V',
    fullAddress: 'XI-11 & 12, Block EP, Sector V, Salt Lake Electronics Complex, Kolkata 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5718,
    lng: 88.4368,
    category: 'office',
    aliases: ['globsyn crystals', 'globsyn sector 5', 'ep block globsyn']
  },
  {
    label: 'Millennium City IT Park, DN Block, Sector V',
    fullAddress: 'Plot DN-62, Sector V, Bidhannagar, Salt Lake, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5790,
    lng: 88.4385,
    category: 'office',
    aliases: ['millennium city', 'millennium city it park', 'dn 62 sector 5']
  },
  {
    label: 'College More / Sector V Metro Gate',
    fullAddress: 'College More, Sector V, Bidhannagar, Salt Lake, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
    city: 'Kolkata',
    lat: 22.5778,
    lng: 88.4318,
    category: 'landmark',
    aliases: ['college more', 'sector 5 metro', 'salt lake sector v metro']
  },
  {
    label: 'Karunamoyee, Salt Lake Sector II',
    fullAddress: 'Karunamoyee Bus Terminus & Metro, Bidhannagar, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector II',
    city: 'Kolkata',
    lat: 22.5844,
    lng: 88.4220,
    category: 'landmark',
    aliases: ['karunamoyee', 'salt lake sector 2', 'sector 2 salt lake', 'sector 1 salt lake', 'sector 3 salt lake']
  },
  {
    label: 'Biswa Bangla Gate (Narkelbagan), New Town',
    fullAddress: 'Major Arterial Road, Action Area I, New Town, Kolkata, West Bengal 700156',
    locality: 'New Town Action Area I',
    city: 'Kolkata',
    lat: 22.5819,
    lng: 88.4589,
    category: 'landmark',
    aliases: ['biswa bangla gate', 'narkelbagan', 'new town gate', 'axis mall new town', 'action area 1']
  },
  {
    label: 'Chinar Park & Rajarhat Main Road',
    fullAddress: 'Chinar Park Crossing, Rajarhat, Tegharia, Kolkata, West Bengal 700157',
    locality: 'Rajarhat / Chinar Park',
    city: 'Kolkata',
    lat: 22.6231,
    lng: 88.4452,
    category: 'landmark',
    aliases: ['chinar park', 'rajarhat', 'city centre 2', 'teghoria', 'haldiram vip road']
  },
  {
    label: 'Gariahat & Ballygunge Crossing',
    fullAddress: 'Gariahat Road, Ballygunge, Kolkata, West Bengal 700019',
    locality: 'Ballygunge / Gariahat',
    city: 'Kolkata',
    lat: 22.5194,
    lng: 88.3656,
    category: 'landmark',
    aliases: ['gariahat', 'ballygunge', 'golpark', 'dhakuria', 'rashbehari']
  },
  {
    label: 'Jadavpur & 8B Bus Stand',
    fullAddress: 'Raja Subodh Chandra Mallick Rd, Jadavpur, Kolkata, West Bengal 700032',
    locality: 'Jadavpur',
    city: 'Kolkata',
    lat: 22.4955,
    lng: 88.3709,
    category: 'landmark',
    aliases: ['jadavpur', 'jadavpur university', '8b bus stand', 'tollygunge', 'garia']
  },
  {
    label: 'Ruby Crossing & Kasba Industrial Estate',
    fullAddress: 'EM Bypass, Ruby General Hospital Crossing, Anandapur, Kasba, Kolkata 700107',
    locality: 'Kasba / EM Bypass',
    city: 'Kolkata',
    lat: 22.5133,
    lng: 88.4017,
    category: 'office',
    aliases: ['ruby crossing', 'kasba', 'acropolis mall', 'anandapur', 'science city kolkata']
  },
  {
    label: 'Esplanade / Dharmatala & Chandni Chowk',
    fullAddress: 'Esplanade Metro & Chowringhee Road, Central Kolkata, West Bengal 700069',
    locality: 'Central Kolkata',
    city: 'Kolkata',
    lat: 22.5646,
    lng: 88.3521,
    category: 'landmark',
    aliases: ['esplanade', 'dharmatala', 'chandni chowk kolkata', 'central kolkata', 'dalhousie', 'bbd bagh']
  },
  {
    label: 'Rang De Basanti Dhaba, Sector 5, Salt Lake',
    fullAddress: 'DN-37, Sector V, Bidhannagar, Kolkata, West Bengal 700091',
    locality: 'Salt Lake Sector V',
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
 * Searches the curated in-memory dataset of high-priority hubs, eateries and landmarks.
 * When query is empty or 1 char, returns the closest curated places to the user's anchor
 * (or top tech corridors across India) for instant zero-latency recommendations.
 */
export function searchCuratedPlaces(query, anchorLat, anchorLng) {
  const { raw, cleanWithoutCity, targetCity } = expandSearchQuery(query);
  const qLower = raw.toLowerCase();
  const qCleanNoCity = cleanWithoutCity.toLowerCase();

  // Instant recommendations when input is empty or 1 character
  if (!raw || raw.length < 2) {
    const firstChar = qLower;
    const items = CURATED_PLACES
      .filter((place) => {
        if (!firstChar) return place.category === 'office' || place.category === 'landmark';
        const hay = `${place.label} ${place.city} ${place.locality || ''} ${(place.aliases || []).join(' ')}`.toLowerCase();
        return hay.includes(firstChar);
      })
      .map((place) => {
        const dist = anchorLat != null && anchorLng != null
          ? calculateDistanceKm(anchorLat, anchorLng, place.lat, place.lng)
          : null;
        const startsWithBoost = firstChar && (
          place.label.toLowerCase().startsWith(firstChar) ||
          place.city.toLowerCase().startsWith(firstChar) ||
          (place.aliases || []).some((a) => a.toLowerCase().startsWith(firstChar))
        ) ? 80 : 0;
        const proxBoost = dist != null ? Math.max(0, 120 - dist * 1.5) : 0;
        return {
          label: place.label,
          name: place.label,
          locality: place.locality || '',
          state: stateForCity(place.city),
          fullAddress: place.fullAddress,
          city: place.city,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
          specificity: place.category === 'office' ? 82 : 70,
          source: 'curated_local',
          distanceKm: dist,
          distanceFormatted: formatDistance(dist),
          score: startsWithBoost + proxBoost + (place.category === 'office' ? 25 : 0)
        };
      });

    items.sort((a, b) => (b.score || 0) - (a.score || 0));
    return items.slice(0, 10);
  }

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
    if (targetCity && cityLower === targetCity && (!qCleanNoCity || qCleanNoCity === targetCity)) {
      score += 95;
    }

    // Direct match against label
    if (labelLower.includes(qLower) || (qCleanNoCity && labelLower.includes(qCleanNoCity))) {
      score += 100;
    }

    // Match against aliases
    if (place.aliases?.some(a => a.includes(qLower) || qLower.includes(a) || (qCleanNoCity && (a.includes(qCleanNoCity) || qCleanNoCity.includes(a))))) {
      score += 85;
    }

    // Match against address or city
    if (addrLower.includes(qLower) || cityLower.includes(qLower) || (qCleanNoCity && addrLower.includes(qCleanNoCity))) {
      score += 45;
    }

    // Partial word token overlap
    const words = qCleanNoCity.split(/\s+/).filter(w => w.length >= 2);
    const matchedWords = words.filter(w => labelLower.includes(w) || addrLower.includes(w) || cityLower.includes(w));
    if (matchedWords.length > 0) {
      score += (matchedWords.length / words.length) * 55;
    }

    if (score > 30) {
      const dist = anchorLat != null && anchorLng != null
        ? calculateDistanceKm(anchorLat, anchorLng, place.lat, place.lng)
        : null;

      matches.push({
        label: place.label,
        name: place.label,
        locality: place.locality || '',
        state: stateForCity(place.city),
        fullAddress: place.fullAddress,
        city: place.city,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        specificity: place.category === 'office' ? 82 : 70,
        source: 'curated_local',
        distanceKm: dist,
        distanceFormatted: formatDistance(dist),
        score: score + (dist != null && dist < 50 ? (50 - dist) * 0.9 : 0)
      });
    }
  }

  // Sort by score + proximity
  matches.sort((a, b) => (b.score || 0) - (a.score || 0));
  return matches;
}

// ---------------------------------------------------------------------------
// Structured suggestions, specificity & ranking
// ---------------------------------------------------------------------------

const CITY_STATES = {
  kolkata: 'West Bengal',
  howrah: 'West Bengal',
  bengaluru: 'Karnataka',
  hyderabad: 'Telangana',
  gurugram: 'Haryana',
  noida: 'Uttar Pradesh',
  delhi: 'Delhi',
  'new delhi': 'Delhi',
  mumbai: 'Maharashtra',
  pune: 'Maharashtra',
  chennai: 'Tamil Nadu'
};

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stateForCity(city = '') {
  return CITY_STATES[normalizeText(city)] || '';
}

/**
 * 0-100 precision score. Buildings/POIs beat streets, which beat localities,
 * which beat city/region centroids. Used for ranking and map zoom.
 */
function specificityFromPhoton(p = {}) {
  const key = normalizeText(p.osm_key);
  const value = normalizeText(p.osm_value);
  const type = normalizeText(p.type);

  if (['building', 'amenity', 'shop', 'office', 'tourism', 'leisure', 'craft'].includes(key)) return 92;
  if (type === 'house' || value === 'house') return 92;
  if (['house', 'building', 'office', 'commercial'].includes(type)) return 92;
  if (['street', 'road', 'highway', 'footway', 'path'].includes(key) || ['street', 'road'].includes(type)) return 62;
  if (['suburb', 'neighbourhood', 'quarter', 'locality', 'district', 'hamlet', 'borough'].includes(value)) return 52;
  if (['suburb', 'neighbourhood', 'quarter', 'locality', 'district', 'city_district'].includes(type)) return 52;
  if (['city', 'town', 'village', 'municipality'].includes(value) || ['city', 'town', 'village'].includes(type)) return 30;
  if (['county', 'state', 'region'].includes(value) || ['state', 'county', 'region'].includes(type)) return 12;
  return 40;
}

function specificityFromNominatim(item = {}) {
  const cls = normalizeText(item.class);
  const type = normalizeText(item.type);
  const addresstype = normalizeText(item.addresstype);
  const rank = Number(item.place_rank);

  if (['building', 'amenity', 'office', 'shop', 'tourism', 'leisure', 'craft'].includes(cls)) return 92;
  if (type === 'house' || addresstype === 'building') return 92;
  if (['road', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'pedestrian'].includes(type)) return 62;
  if (
    ['suburb', 'neighbourhood', 'quarter', 'locality', 'city_district', 'borough'].includes(type) ||
    ['suburb', 'neighbourhood', 'quarter', 'locality'].includes(addresstype)
  ) return 52;
  if (
    ['city', 'town', 'village', 'municipality'].includes(type) ||
    ['city', 'town', 'village'].includes(addresstype)
  ) return 30;
  if (['state', 'county', 'region'].includes(type) || ['state', 'county', 'region'].includes(addresstype)) return 12;
  if (Number.isFinite(rank)) {
    if (rank >= 26) return 60;
    if (rank >= 22) return 45;
    if (rank >= 16) return 30;
  }
  return 40;
}

/**
 * Readable "locality · city · state" subtitle, without repeating the same value.
 */
export function formatPlaceSubtitle(place = {}) {
  const parts = [];
  for (const raw of [place.locality, place.city, place.state]) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const lower = value.toLowerCase();
    if (parts.some((existing) => existing.toLowerCase() === lower)) continue;
    if (parts.some((existing) => existing.toLowerCase().includes(lower) || lower.includes(existing.toLowerCase()))) continue;
    parts.push(value);
  }
  return parts.join(' · ');
}

/**
 * Zoom level that matches the precision of a suggestion.
 */
export function zoomForPlace(place = {}) {
  const specificity = Number(place.specificity);
  if (Number.isFinite(specificity)) {
    if (specificity >= 80) return 18;
    if (specificity >= 50) return 16;
    if (specificity >= 28) return 13;
    return 11;
  }
  return 15;
}

/**
 * JSON fetch with a timeout that is linked to the caller's abort signal.
 * Throws AbortError when the caller aborts and an HTTP error when the provider
 * rejects the request (status attached for rate-limit detection).
 */
async function requestJson(url, { signal, headers, timeoutMs = 2200 } = {}) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onParentAbort);
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }
}

function isSamePlace(a, b) {
  const distance = calculateDistanceKm(a.lat, a.lng, b.lat, b.lng);
  if (distance == null) return false;
  if (distance < 0.03) return true;
  if (distance >= 0.3) return false;

  const nameA = normalizeText(a.name || a.label);
  const nameB = normalizeText(b.name || b.label);
  if (!nameA || !nameB) return false;
  return nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA);
}

function scoreSuggestion(item, queryText) {
  const specificity = Number.isFinite(Number(item.specificity)) ? Number(item.specificity) : 40;
  const query = normalizeText(queryText);
  const tokens = query.split(' ').filter((token) => token.length > 1);
  const haystack = normalizeText(
    `${item.name || ''} ${item.label || ''} ${item.locality || ''} ${item.city || ''} ${item.fullAddress || ''}`
  );

  const matched = tokens.filter((token) => haystack.includes(token)).length;
  const tokenScore = tokens.length ? (matched / tokens.length) * 100 : 0;
  const exactName = tokens.length && normalizeText(item.name || item.label) === query ? 45 : 0;

  const distance = item.distanceKm;
  const proximity = distance == null ? 0 : Math.max(0, 100 - distance * 1.5);
  const sourceBonus = {
    google_places: 24,
    local_db: 20,
    curated_local: 18,
    photon: 10,
    osm_nominatim: 8
  }[item.source] || 0;

  // Searching for a multi-word building while a provider only offers the city
  // centroid should not win just because it is close.
  const genericPenalty = specificity < 40 && tokens.length > 1 ? 30 : 0;

  return specificity * 1.4 + tokenScore * 0.9 + exactName + proximity * 0.6 + sourceBonus - genericPenalty;
}

/**
 * Detailed place search with structured suggestions and failure telemetry.
 *
 * @returns {Promise<{results: Array, degraded: boolean, failures: Array}>}
 */
export async function searchPlacesDetailed(searchQuery, anchorLat, anchorLng, abortSignal) {
  const trimmed = (searchQuery || '').trim();
  if (trimmed.length < 2) {
    const instant = searchCuratedPlaces(trimmed, anchorLat, anchorLng);
    return { results: instant, degraded: false, failures: [] };
  }

  const { raw, cleanWithoutCity, targetCity } = expandSearchQuery(searchQuery);
  const effectiveQuery = targetCity ? `${cleanWithoutCity} ${targetCity}`.trim() : raw;
  const matchText = `${cleanWithoutCity} ${targetCity || ''}`.trim() || raw;

  const collected = [];
  const failures = [];

  const push = (item) => {
    if (!item) return;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

    const distance = anchorLat != null && anchorLng != null
      ? calculateDistanceKm(anchorLat, anchorLng, lat, lng)
      : null;

    collected.push({
      ...item,
      lat,
      lng,
      distanceKm: distance,
      distanceFormatted: formatDistance(distance)
    });
  };

  // 1. Curated local hubs & landmarks (instant, no network)
  const curated = searchCuratedPlaces(raw, anchorLat, anchorLng).map((item) => ({
    ...item,
    name: item.label,
    locality: '',
    state: stateForCity(item.city),
    specificity: item.category === 'office' ? 78 : 70,
    source: 'curated_local'
  }));
  curated.forEach(push);

  const recordFailure = (provider) => (error) => {
    if (abortSignal?.aborted) throw error;
    const status = error?.status || 0;
    failures.push({
      provider,
      status,
      reason: status === 429
        ? 'rate_limited'
        : (status === 401 || status === 403)
          ? 'blocked'
          : (error?.name === 'AbortError' ? 'timeout' : 'network_error')
    });
  };

  const tasks = [];

  // 2. Backend: Google Places (when configured) + JobRadar offices/companies
  let dbUrl = `/api/directory/places/search?q=${encodeURIComponent(effectiveQuery)}&limit=10`;
  if (anchorLat != null && anchorLng != null) {
    dbUrl += `&lat=${anchorLat}&lng=${anchorLng}`;
  }
  tasks.push(
    requestJson(dbUrl, { signal: abortSignal, timeoutMs: 2500 })
      .then((data) => {
        if (!Array.isArray(data?.places)) return;
        data.places.forEach((item) => {
          push({
            ...item,
            name: item.name || item.label,
            locality: item.locality || '',
            state: item.state || '',
            specificity: item.specificity ?? (item.category === 'office' ? 85 : 60),
            source: item.source || 'local_db'
          });
        });
      })
      .catch(recordFailure('local_db'))
  );

  // 3. Photon (OSM) building/POI coverage, biased to the user's area
  let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(effectiveQuery)}&limit=10&lang=en`;
  if (anchorLat != null && anchorLng != null) {
    photonUrl += `&lat=${anchorLat}&lon=${anchorLng}&location_bias_scale=0.95`;
  }
  const isAnchorInIndia = anchorLat != null && anchorLng != null
    && anchorLat >= 6.0 && anchorLat <= 37.5
    && anchorLng >= 68.0 && anchorLng <= 98.0;

  tasks.push(
    requestJson(photonUrl, { signal: abortSignal, timeoutMs: 2200 })
      .then((data) => {
        if (!Array.isArray(data?.features)) return;
        data.features.forEach((feature) => {
          const coords = feature.geometry?.coordinates;
          if (!coords || coords.length < 2) return;

          const p = feature.properties || {};
          const country = p.country || '';
          const countryCode = (p.countrycode || p.iso_a2 || '').toLowerCase();
          const isIndianResult = countryCode === 'in' || /india|bharat/i.test(country);
          const queryMentionsCountry = country && raw.toLowerCase().includes(country.toLowerCase());
          if (isAnchorInIndia && !isIndianResult && !queryMentionsCountry) return;

          const name = p.name || p.street || '';
          const locality = p.locality || p.district || '';
          const city = p.city || p.county || '';
          const state = p.state || '';
          const isFood = ['restaurant', 'food_court', 'dhaba', 'fast_food', 'cafe', 'bar'].includes(p.osm_value) || p.osm_key === 'amenity';
          const isOffice = ['company', 'office', 'commercial'].includes(p.osm_value) || p.osm_key === 'office';

          push({
            label: name || locality || city,
            name,
            locality,
            city,
            state,
            fullAddress: [p.name, p.street, p.locality, p.district, p.city, state, country].filter(Boolean).join(', '),
            lat: coords[1],
            lng: coords[0],
            category: isFood ? 'food' : (isOffice ? 'office' : 'landmark'),
            specificity: specificityFromPhoton(p),
            source: 'photon'
          });
        });
      })
      .catch(recordFailure('photon'))
  );

  // 4. Nominatim (OSM) — strongest building/POI naming in India
  let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(effectiveQuery)}&limit=8&addressdetails=1`;
  if (isAnchorInIndia) nominatimUrl += '&countrycodes=in';
  if (anchorLat != null && anchorLng != null) {
    const minLon = (anchorLng - 0.75).toFixed(4);
    const maxLon = (anchorLng + 0.75).toFixed(4);
    const minLat = (anchorLat - 0.75).toFixed(4);
    const maxLat = (anchorLat + 0.75).toFixed(4);
    nominatimUrl += `&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=0`;
  }

  tasks.push(
    requestJson(nominatimUrl, {
      signal: abortSignal,
      headers: { Accept: 'application/json' },
      timeoutMs: 2200
    })
      .then((data) => {
        if (!Array.isArray(data)) return;
        data.forEach((item) => {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          const addr = item.address || {};
          const poi = addr.amenity || addr.shop || addr.building || addr.office || addr.tourism || addr.leisure || '';
          const locality = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || addr.road || '';
          const city = addr.city || addr.town || addr.municipality || addr.state_district || '';
          const state = addr.state || '';

          const isFood = ['restaurant', 'dhaba', 'fast_food', 'cafe', 'food_court'].includes(item.type);
          const isOffice = ['office', 'commercial', 'industrial'].includes(item.type) || ['office', 'building'].includes(item.class);

          push({
            label: poi || locality || city || (item.display_name || '').split(',')[0],
            name: poi || locality || city,
            locality,
            city,
            state,
            fullAddress: item.display_name || '',
            lat,
            lng,
            category: isFood ? 'food' : (isOffice ? 'office' : 'landmark'),
            specificity: specificityFromNominatim(item),
            source: 'osm_nominatim'
          });
        });
      })
      .catch(recordFailure('osm_nominatim'))
  );

  await Promise.allSettled(tasks);

  if (abortSignal?.aborted) {
    throw new DOMException('Search aborted', 'AbortError');
  }

  // Specific places win dedupe ties, then ranking prefers precision over raw proximity.
  const unique = [];
  for (const item of [...collected].sort((a, b) => (b.specificity || 0) - (a.specificity || 0))) {
    if (unique.some((existing) => isSamePlace(existing, item))) continue;
    unique.push(item);
  }

  const results = unique
    .map((item) => ({ ...item, score: scoreSuggestion(item, matchText) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  return {
    results,
    degraded: failures.length > 0,
    failures
  };
}

/**
 * Backwards-compatible helper that returns only the ranked suggestions.
 */
export async function searchPlacesLikeGoogleMaps(searchQuery, anchorLat, anchorLng, abortSignal) {
  const { results } = await searchPlacesDetailed(searchQuery, anchorLat, anchorLng, abortSignal);
  return results;
}
