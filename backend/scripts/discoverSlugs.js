/**
 * Verified Company Discovery Script
 * Tests candidate company slugs against public, unauthenticated ATS APIs.
 *
 * Rules:
 * - Never fabricate slugs. Only store verified endpoints that return 200 OK and valid job boards.
 * - Prints "matched via <ats>/<slug>" or "no match" for each candidate.
 * - Respects 1 request/second per host.
 * - Resumable: reads existing config/companies.json and data/unmatched.json.
 */

const fs = require('fs');
const path = require('path');
const { rateLimitHost } = require('../utils/rateLimiter');

const CANDIDATES_FILE = path.join(__dirname, '..', 'data', 'candidateCompanies.json');
const COMPANIES_FILE = path.join(__dirname, '..', 'config', 'companies.json');
const UNMATCHED_FILE = path.join(__dirname, '..', 'data', 'unmatched.json');

// Ensure parent data directory exists
const dataDir = path.dirname(CANDIDATES_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Loads JSON file safely, returns fallback if not found.
 */
function loadJson(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`[Discover] Failed to read ${filePath}: ${err.message}`);
  }
  return fallback;
}

/**
 * Writes JSON file formatted.
 */
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Generates slug candidates for a company name and domain.
 */
function generateSlugVariants(company) {
  const name = company.name;
  const domain = company.domain || '';
  const domainSlug = domain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hyphen = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const variants = new Set();
  variants.add(clean);
  if (hyphen && hyphen !== clean) variants.add(hyphen);
  if (domainSlug && domainSlug !== clean) variants.add(domainSlug);
  variants.add(`${clean}hq`);
  variants.add(`${clean}inc`);
  variants.add(`${clean}tech`);

  // Specific known legal/ATS slugs for Indian tech candidates
  if (clean === 'razorpay') {
    variants.add('razorpaysoftwareprivatelimited');
    variants.add('razorpay-software');
  }
  if (clean === 'phonepe') {
    variants.add('phonepe-limited');
    variants.add('phonepelimited');
    variants.add('PhonePe');
  }
  if (clean === 'browserstack') {
    variants.add('browserstack');
  }
  if (clean === 'postman') {
    variants.add('postman');
  }
  if (clean === 'urbancompany') {
    variants.add('urban-company');
    variants.add('urbanclap');
  }
  if (clean === 'swiggy') {
    variants.add('swiggy');
  }
  if (clean === 'cars24') {
    variants.add('cars24');
  }
  if (clean === 'unacademy') {
    variants.add('unacademy');
  }
  if (clean === 'chargebee') {
    variants.add('chargebee');
  }
  if (clean === 'clevertap') {
    variants.add('clevertap');
  }
  if (clean === 'moengage') {
    variants.add('moengage');
  }
  if (clean === 'mindtickle') {
    variants.add('mindtickle');
  }
  if (clean === 'atlan') {
    variants.add('atlan');
  }
  if (clean === 'hasura') {
    variants.add('hasura');
  }

  return Array.from(variants);
}

/**
 * Verifies a slug on Greenhouse.
 */
async function verifyGreenhouse(slug) {
  await rateLimitHost('boards-api.greenhouse.io');
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (res.status === 200) {
      const data = await res.json();
      if (data && Array.isArray(data.jobs)) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

/**
 * Verifies a slug on Lever.
 */
async function verifyLever(slug) {
  await rateLimitHost('api.lever.co');
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (res.status === 200) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

/**
 * Verifies a slug on Ashby.
 */
async function verifyAshby(slug) {
  await rateLimitHost('api.ashbyhq.com');
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (res.status === 200) {
      const data = await res.json();
      if (data && Array.isArray(data.jobs)) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

/**
 * Verifies a slug on SmartRecruiters.
 */
async function verifySmartRecruiters(slug) {
  await rateLimitHost('api.smartrecruiters.com');
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=1`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (res.status === 200) {
      const data = await res.json();
      if (data && typeof data.totalFound === 'number' && data.totalFound > 0 && Array.isArray(data.content)) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

/**
 * Main discovery runner.
 */
async function runDiscovery() {
  const force = process.argv.includes('--force');
  const candidates = loadJson(CANDIDATES_FILE, []);
  let verifiedCompanies = loadJson(COMPANIES_FILE, []);
  let unmatchedList = loadJson(UNMATCHED_FILE, []);

  // Standardize existing entries in companies.json if they only have greenhouseSlug
  verifiedCompanies = verifiedCompanies.map((c) => {
    if (!c.ats && c.greenhouseSlug) {
      return {
        name: c.name,
        ats: 'greenhouse',
        slug: c.greenhouseSlug,
        verifiedAt: c.verifiedAt || new Date().toISOString()
      };
    }
    return c;
  });

  const verifiedByName = new Map(verifiedCompanies.map((c) => [c.name.toLowerCase(), c]));
  const unmatchedByName = new Set(unmatchedList.map((c) => (typeof c === 'string' ? c.toLowerCase() : c.name.toLowerCase())));

  console.log(`[Discover] Starting discovery for ${candidates.length} candidates... (Resumable: ${!force})`);

  for (const candidate of candidates) {
    const candKey = candidate.name.toLowerCase();

    // Check if already matched
    if (!force && verifiedByName.has(candKey)) {
      const matched = verifiedByName.get(candKey);
      console.log(`[${candidate.name}] matched via ${matched.ats}/${matched.slug}`);
      continue;
    }

    // Check if already known unmatched
    if (!force && unmatchedByName.has(candKey)) {
      console.log(`[${candidate.name}] no match`);
      continue;
    }

    const variants = generateSlugVariants(candidate);
    let matched = null;

    // Test ATS endpoints in order: Greenhouse, Lever, Ashby, SmartRecruiters
    for (const slug of variants) {
      // 1. Greenhouse
      const isGreenhouse = await verifyGreenhouse(slug);
      if (isGreenhouse) {
        matched = { name: candidate.name, ats: 'greenhouse', slug, verifiedAt: new Date().toISOString() };
        break;
      }

      // 2. Lever
      const isLever = await verifyLever(slug);
      if (isLever) {
        matched = { name: candidate.name, ats: 'lever', slug, verifiedAt: new Date().toISOString() };
        break;
      }

      // 3. Ashby
      const isAshby = await verifyAshby(slug);
      if (isAshby) {
        matched = { name: candidate.name, ats: 'ashby', slug, verifiedAt: new Date().toISOString() };
        break;
      }

      // 4. SmartRecruiters
      const isSmartRecruiters = await verifySmartRecruiters(slug);
      if (isSmartRecruiters) {
        matched = { name: candidate.name, ats: 'smartrecruiters', slug, verifiedAt: new Date().toISOString() };
        break;
      }
    }

    if (matched) {
      console.log(`[${candidate.name}] matched via ${matched.ats}/${matched.slug}`);
      verifiedByName.set(candKey, matched);
      // Remove from unmatched if it was there
      unmatchedByName.delete(candKey);
      unmatchedList = unmatchedList.filter((u) => (typeof u === 'string' ? u.toLowerCase() : u.name.toLowerCase()) !== candKey);
      
      // Update companies.json progressively so progress is never lost
      saveJson(COMPANIES_FILE, Array.from(verifiedByName.values()));
      saveJson(UNMATCHED_FILE, unmatchedList);
    } else {
      console.log(`[${candidate.name}] no match`);
      unmatchedByName.add(candKey);
      if (!unmatchedList.some((u) => (typeof u === 'string' ? u.toLowerCase() : u.name.toLowerCase()) === candKey)) {
        unmatchedList.push({ name: candidate.name, domain: candidate.domain || '', attemptedSlugs: variants });
      }
      saveJson(UNMATCHED_FILE, unmatchedList);
    }
  }

  saveJson(COMPANIES_FILE, Array.from(verifiedByName.values()));
  saveJson(UNMATCHED_FILE, unmatchedList);

  console.log(`\n[Discover] Discovery complete. Total verified companies: ${verifiedByName.size}`);
}

if (require.main === module) {
  runDiscovery()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Discover] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runDiscovery, generateSlugVariants };
