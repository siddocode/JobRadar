const { URL } = require('url');

/**
 * Extracts a normalized domain from a URL (e.g. "https://www.example.com/careers" -> "example.com")
 */
function extractDomain(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  let raw = inputUrl.trim();
  if (!raw) return null;

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = 'https://' + raw;
  }

  try {
    const parsed = new URL(raw);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    // Basic validation: must contain a dot and at least 2 chars
    if (host.includes('.') && host.length >= 4) {
      return host;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a company name for fuzzy matching and deduplication
 */
function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';
  let cleaned = name.toLowerCase().trim();

  // Remove common Indian & global corporate suffixes
  cleaned = cleaned
    .replace(/\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|limited|inc\.?|incorporated|llp|llc|corp\.?|corporation)\b/gi, '')
    .replace(/\b(technologies|technology|solutions|services|systems|software|global|india)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Generates a clean URL slug from a name
 */
function slugify(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Simple bigram-based Sorensen-Dice similarity score (0.0 to 1.0)
 */
function stringSimilarity(str1, str2) {
  const s1 = (str1 || '').toLowerCase().trim();
  const s2 = (str2 || '').toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2 || s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  let intersection = 0;

  for (const [bigram, count] of b1.entries()) {
    if (b2.has(bigram)) {
      intersection += Math.min(count, b2.get(bigram));
    }
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0;
}

/**
 * Links unassigned jobs in Job collection to the given company
 */
async function linkJobsForCompany(company, Job) {
  if (!company || !Job) return 0;
  try {
    const cleanName = company.name.trim();
    const cleanSlug = company.slug.trim();

    // Match exact name, or case-insensitive exact name
    const query = {
      companyId: null,
      $or: [
        { company: cleanName },
        { company: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      ]
    };

    if (company.atsSlug) {
      query.$or.push({ company: company.atsSlug });
    }

    const res = await Job.updateMany(query, {
      $set: { companyId: company._id }
    });

    return res.modifiedCount || 0;
  } catch (err) {
    console.error(`Error linking jobs for company ${company.name}:`, err.message);
    return 0;
  }
}

// Domains indicating government, state education, civic, diplomatic, insurance, or public administration
const GOV_DOMAIN_REGEX = /(\.(gov|nic|mil)(\.[a-z]{2,3})?(\/|$)|wbbse\.org|wb\.gov|police\.gov|mygov|india\.gov|stqc\.gov|passportindia\.gov|wbpwd\.gov|gsi\.gov|criwb\.in|ivri\.nic|arunachalilp\.com|wbsedcl\.in|bwssb\.karnataka|mrsac\.gov|transport\.maharashtra|rajbhavan|kpsc\.kar\.nic|mcgkolkata\.org|mzv\.cz|licindia\.in|cesc\.co\.in)/i;

// Government, civic, police, judiciary, bureaucracy, public utility, diplomatic, political, insurance, accommodation, or non-tech commodity terms
const GOV_NAME_REGEX = /\b(board of (secondary|intermediate|school|education)|secondary education|municipal|corporation|panchayat|seva kendra|passport|police|thana|chowki|court|tribunal|judiciary|advocate|law chamber|solicitor|secretariat|ministry|department of|commissionerate|collectorate|registrar|sub-registrar|vidhan|vidhan sabha|rajya sabha|lok sabha|bsnl|mtnl|railway|metro rail|port trust|survey of india|geological survey|anthropological survey|botanical survey|zoological survey|veterinary research|cyclotron|stqc|atomic research|drdo|isro|post office|postal|dak ghar|bhawan|bhavan|raj bhavan|water supply|sewage board|transport corporation|power transmission|power distribution|state financial corporation|seed and organic|beverages corporation|consulate|high commission|embassy|diplomatic|visa office|foreign mission|party office|communist party|trinamool|congress|cpim|tmc|political party|ghee|sports club|motor sports|heritage walk|capsule|american center|life insurance|lic |zonal office|exide|cesc|eco park|sahara india|pg|paying guest|hostel|guest house|homestay|dharamsala|airconditionning|air conditioning|ac repair|car rental|taxi service)\b/i;

// Non-tech OSM office tags
const GOV_OR_NON_TECH_TAGS = new Set([
  'government',
  'educational_institution',
  'school',
  'college',
  'university',
  'administrative',
  'police',
  'tax_advisor',
  'ngo',
  'association',
  'lawyer',
  'insurance',
  'estate_agent',
  'employment_agency',
  'foundation',
  'place_of_worship',
  'diplomatic',
  'political_party',
  'consulate',
  'embassy',
  'guide',
  'religious',
  'monastery',
  'charity'
]);

const GOV_AMENITIES = new Set([
  'police',
  'townhall',
  'courthouse',
  'post_office',
  'school',
  'college',
  'university',
  'embassy',
  'prison',
  'hospital',
  'clinic',
  'place_of_worship',
  'restaurant',
  'fast_food',
  'cafe',
  'bar',
  'pub',
  'fuel',
  'pharmacy',
  'bank',
  'atm'
]);

const NON_TECH_RETAIL_SHOPS = new Set([
  'supermarket',
  'convenience',
  'clothes',
  'hairdresser',
  'beauty',
  'car_repair',
  'laundry',
  'bakery',
  'butcher',
  'shoes',
  'jewelry',
  'mall',
  'tea',
  'dairy'
]);

/**
 * Checks whether an entity is a government, municipal, educational board, or non-tech civic office / shop / food stall
 */
function isGovernmentOrNonTechEntity({ name = '', website = '', domain = '', tags = {} } = {}) {
  const normName = (name || '').toLowerCase();
  const normWeb = (website || '').toLowerCase();
  const normDomain = (domain || '').toLowerCase();
  const officeTag = (tags.office || '').toLowerCase().trim();
  const amenityTag = (tags.amenity || '').toLowerCase().trim();
  const shopTag = (tags.shop || '').toLowerCase().trim();

  // 1. Check OSM tags
  if (tags.highway) return true; // Exclude roads and footways
  if (tags.tourism && ['hotel', 'guest_house', 'hostel', 'motel'].includes(tags.tourism.toLowerCase())) return true;
  if (tags.leisure && ['pitch', 'park', 'fitness_centre', 'sports_centre'].includes(tags.leisure.toLowerCase())) return true;
  if (officeTag && GOV_OR_NON_TECH_TAGS.has(officeTag)) return true;
  if (amenityTag && GOV_AMENITIES.has(amenityTag)) return true;
  // All retail consumer shops (electronics, supermarkets, clothing, repair) are excluded
  if (shopTag) return true;
  if (tags.government && tags.government !== 'no') return true;

  // 2. Check domain / URL
  if (GOV_DOMAIN_REGEX.test(normWeb) || GOV_DOMAIN_REGEX.test(normDomain)) return true;

  // 3. Check entity name
  if (GOV_NAME_REGEX.test(normName)) return true;

  // 4. Common non-tech business names & consumer retail chains (salons, dry cleaners, electronics retail stores, restaurants)
  if (/\b(reliance digital|croma|vijay sales|poorvika|sangeetha|apple store|samsung store|sony center|lotus electronics|chroma|mobile store|mobile shop|mobile repair|electronics shop|electronics retail|retail store|department store|supermarket|hypermarket|salon|hair cut|dry cleaner|laundry|dhaba|chaap|sweets|bakery|dairy|ice cream|shawarma|restaurant|residency|pg for girls|hostel|hotel|guest house|air con|clinic|dental|ayurveda|pathlab)\b/i.test(normName)) {
    return true;
  }

  return false;
}

const TECH_KEYWORDS_REGEX = /\b(software|tech|technology|technologies|solutions|infotech|labs|digital|consultancy|consulting|it services|cloud|systems|robotics|ai|artificial intelligence|machine learning|data|analytics|cyber|infosec|web dev|web design|web development|app dev|mobile apps|automation|fintech|edtech|healthtech|devops|fullstack|saas|platform|code|coding)\b/i;

/**
 * Classifies an entity as a verified tech company vs general business
 */
function classifyTechCompany({ name = '', website = '', tags = {} } = {}) {
  const normName = (name || '').toLowerCase();
  const officeTag = (tags.office || '').toLowerCase().trim();
  const amenityTag = (tags.amenity || '').toLowerCase().trim();

  // Explicit tech office tags
  if (officeTag === 'it' || officeTag === 'software' || officeTag === 'telecommunication') {
    return { isTech: true, category: 'Software & IT Services' };
  }
  if (officeTag === 'research') {
    return { isTech: true, category: 'R&D / Tech Research' };
  }
  if (officeTag === 'coworking' || amenityTag === 'coworking_space') {
    return { isTech: true, category: 'Coworking Space' };
  }

  // Name / keyword matching
  if (TECH_KEYWORDS_REGEX.test(normName)) {
    if (/\b(ai|intelligence|analytics|data|machine learning)\b/i.test(normName)) {
      return { isTech: true, category: 'AI & Data Solutions' };
    }
    if (/\b(consultancy|consulting|services)\b/i.test(normName)) {
      return { isTech: true, category: 'IT Consulting & Services' };
    }
    if (/\b(digital agency|web design|digital marketing|media solutions|creative lab)\b/i.test(normName)) {
      return { isTech: true, category: 'Digital Agency & Web Solutions' };
    }
    return { isTech: true, category: 'Software & IT Services' };
  }

  return { isTech: false, category: 'Company' };
}

/**
 * Detects specific business district or IT tech corridor locality from GPS coordinates
 */
function detectLocalityFromCoords(lat, lng, citySlug = '') {
  if (lat == null || lng == null) return null;
  const slug = (citySlug || '').toLowerCase().trim();

  if (slug === 'gurgaon' || slug === 'gurugram') {
    if (lat >= 28.488 && lat <= 28.502 && lng >= 77.082 && lng <= 77.098) return 'DLF Cyber City / Cyber Hub';
    if (lat >= 28.485 && lat <= 28.515 && lng >= 77.065 && lng <= 77.085) return 'Udyog Vihar';
    if (lat >= 28.458 && lat <= 28.480 && lng >= 77.085 && lng <= 77.108) return 'Golf Course Road (Sector 42-43)';
    if (lat >= 28.460 && lat <= 28.475 && lng >= 77.042 && lng <= 77.060) return 'Signature Towers (Sector 15)';
    if (lat >= 28.445 && lat <= 28.460 && lng >= 77.060 && lng <= 77.078) return 'Institutional Area (Sector 44)';
    if (lat >= 28.425 && lat <= 28.445 && lng >= 77.010 && lng <= 77.028) return 'Infocity (Sector 33-34)';
    if (lat >= 28.400 && lat <= 28.430 && lng >= 77.030 && lng <= 77.055) return 'Sohna Road / Spaze Tech Park';
    if (lat >= 28.395 && lat <= 28.418 && lng >= 76.990 && lng <= 77.015) return 'DLF Corporate Greens (Sector 74A)';
    if (lat >= 28.450 && lat <= 28.472 && lng >= 77.055 && lng <= 77.072) return 'South City 1 (Sector 30)';
    if (lat >= 28.410 && lat <= 28.435 && lng >= 77.090 && lng <= 77.115) return 'Golf Course Ext. Road (Sector 58-65)';
    return 'Gurugram Tech Corridor';
  }

  if (slug === 'bengaluru' || slug === 'bangalore') {
    if (lat >= 12.830 && lat <= 12.870 && lng >= 77.650 && lng <= 77.690) return 'Electronic City';
    if (lat >= 12.960 && lat <= 13.000 && lng >= 77.720 && lng <= 77.765) return 'Whitefield / ITPL';
    if (lat >= 12.915 && lat <= 12.950 && lng >= 77.670 && lng <= 77.710) return 'Outer Ring Road (Bellandur)';
    if (lat >= 12.920 && lat <= 12.945 && lng >= 77.610 && lng <= 77.645) return 'Koramangala';
    if (lat >= 12.965 && lat <= 12.985 && lng >= 77.635 && lng <= 77.655) return 'Indiranagar / Domlur';
    if (lat >= 12.985 && lat <= 13.005 && lng >= 77.650 && lng <= 77.675) return 'Bagmane Tech Park';
    if (lat >= 13.040 && lat <= 13.075 && lng >= 77.605 && lng <= 77.635) return 'Manyata Tech Park (Hebbal)';
    return 'Bengaluru IT Zone';
  }

  if (slug === 'noida') {
    if (lat >= 28.610 && lat <= 28.640 && lng >= 77.355 && lng <= 77.385) return 'Sector 62 (Candor TechSpace)';
    if (lat >= 28.495 && lat <= 28.530 && lng >= 77.360 && lng <= 77.395) return 'Sector 132-135 (Expressway)';
    if (lat >= 28.535 && lat <= 28.560 && lng >= 77.335 && lng <= 77.360) return 'Sector 126-127 (HCL Corridor)';
    if (lat >= 28.575 && lat <= 28.605 && lng >= 77.300 && lng <= 77.330) return 'Sector 2-5 Tech Zone';
    return 'Noida Tech Corridor';
  }

  if (slug === 'hyderabad') {
    if (lat >= 17.435 && lat <= 17.465 && lng >= 78.365 && lng <= 78.395) return 'HITEC City / Madhapur';
    if (lat >= 17.410 && lat <= 17.450 && lng >= 78.330 && lng <= 78.360) return 'Financial District / Gachibowli';
    if (lat >= 17.425 && lat <= 17.442 && lng >= 78.375 && lng <= 78.388) return 'Knowledge City / Raidurg';
    if (lat >= 17.450 && lat <= 17.470 && lng >= 78.350 && lng <= 78.375) return 'Kondapur';
    return 'Cyberabad IT Corridor';
  }

  if (slug === 'pune') {
    if (lat >= 18.570 && lat <= 18.610 && lng >= 73.675 && lng <= 73.730) return 'Hinjawadi Infotech Park';
    if (lat >= 18.540 && lat <= 18.565 && lng >= 73.940 && lng <= 73.970) return 'Kharadi / EON Free Zone';
    if (lat >= 18.505 && lat <= 18.530 && lng >= 73.920 && lng <= 73.945) return 'Magarpatta Cybercity';
    if (lat >= 18.550 && lat <= 18.580 && lng >= 73.775 && lng <= 73.810) return 'Baner / Balewadi High Street';
    return 'Pune IT Corridor';
  }

  if (slug === 'kolkata') {
    if (lat >= 22.565 && lat <= 22.585 && lng >= 88.420 && lng <= 88.445) return 'Salt Lake Sector V';
    if (lat >= 22.575 && lat <= 22.600 && lng >= 88.455 && lng <= 88.485) return 'New Town Action Area II';
    return 'Kolkata IT Corridor';
  }

  if (slug === 'mumbai') {
    if (lat >= 18.985 && lat <= 19.010 && lng >= 72.820 && lng <= 72.845) return 'Lower Parel Business District';
    if (lat >= 19.055 && lat <= 19.075 && lng >= 72.855 && lng <= 72.880) return 'Bandra Kurla Complex (BKC)';
    if (lat >= 19.105 && lat <= 19.135 && lng >= 72.850 && lng <= 72.880) return 'Andheri East / MIDC';
    if (lat >= 19.110 && lat <= 19.140 && lng >= 73.000 && lng <= 73.030) return 'Navi Mumbai / Ghansoli';
    return 'Mumbai Business District';
  }

  if (slug === 'chennai') {
    if (lat >= 12.950 && lat <= 12.980 && lng >= 80.235 && lng <= 80.260) return 'OMR / Perungudi';
    if (lat >= 12.920 && lat <= 12.950 && lng >= 80.220 && lng <= 80.245) return 'OMR / Thoraipakkam';
    if (lat >= 12.815 && lat <= 12.840 && lng >= 80.025 && lng <= 80.050) return 'GST Road / Estancia IT Park';
    return 'Chennai IT Corridor';
  }

  return null;
}

module.exports = {
  extractDomain,
  normalizeCompanyName,
  slugify,
  stringSimilarity,
  linkJobsForCompany,
  isGovernmentOrNonTechEntity,
  classifyTechCompany,
  detectLocalityFromCoords,
  GOV_DOMAIN_REGEX,
  GOV_NAME_REGEX
};

