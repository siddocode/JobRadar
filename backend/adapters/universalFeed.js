/**
 * Universal Big-Company Job Feed Adapter
 * 
 * Automates job ingestion across enterprise tech giants without custom code per company:
 * 1. Eightfold.ai (Netflix, PayPal, Starbucks, Micron, Capital One)
 * 2. Workday (Salesforce, Adobe, IBM, Dell, HP, Intel, Cisco, Visa, Mastercard)
 * 3. Greenhouse (Twitter / xAI, Airbnb, Stripe, Figma, DoorDash, Datadog)
 * 4. Schema.org / JSON-LD Crawler (Companies embedding standard JobPosting metadata)
 */

const { rateLimitHost } = require('../utils/rateLimiter');
const { normalizeLocation, generateFingerprint } = require('../utils/normalizeLocation');
const { fetchEightfoldJobs } = require('./eightfold');
const { fetchWorkdayJobs } = require('./workday');
const { fetchGreenhouseJobs } = require('./greenhouse');
const { fetchLeverJobs } = require('./lever');
const { fetchAshbyJobs } = require('./ashby');

/**
 * Universal job fetcher: routes automatically based on company configuration
 */
async function fetchUniversalJobs(config, companyName = 'Company') {
  console.log(`[UniversalFeed] Processing automated job feed for "${companyName}"...`);

  // 1. Direct Eightfold engine
  if (config.eightfold || config.eightfoldDomain || config.engine === 'eightfold') {
    const efConfig = config.eightfold || { domain: config.eightfoldDomain || config.slug };
    return fetchEightfoldJobs(efConfig, companyName);
  }

  // 2. Direct Workday engine
  if (config.workday || config.engine === 'workday') {
    return fetchWorkdayJobs(config.workday, companyName);
  }

  // 3. Greenhouse slug
  if (config.greenhouseSlug || (config.engine === 'greenhouse' && config.slug)) {
    return fetchGreenhouseJobs(config.greenhouseSlug || config.slug, companyName);
  }

  // 4. Lever slug
  if (config.engine === 'lever' && config.slug) {
    return fetchLeverJobs(config.slug, companyName);
  }

  // 5. Ashby slug
  if (config.engine === 'ashby' && config.slug) {
    return fetchAshbyJobs(config.slug, companyName);
  }

  // 6. Schema.org / JSON-LD Career Page Extractor
  if (config.careerUrl) {
    return crawlSchemaOrgJobs(config.careerUrl, companyName);
  }

  return {
    success: false,
    error: `No universal engine configuration found for "${companyName}"`,
    jobs: []
  };
}

/**
 * Crawls a company career page for Schema.org <script type="application/ld+json"> with @type: "JobPosting"
 */
async function crawlSchemaOrgJobs(careerUrl, companyName) {
  try {
    const parsed = new URL(careerUrl);
    await rateLimitHost(parsed.hostname);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(careerUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}`, jobs: [] };
    }

    const html = await res.text();
    const schemaMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const jobs = [];

    for (const match of schemaMatches) {
      try {
        const parsedJson = JSON.parse(match[1]);
        const items = Array.isArray(parsedJson) ? parsedJson : (parsedJson['@graph'] || [parsedJson]);

        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            const title = (item.title || 'Untitled Role').trim();
            const sourceJobId = String(item.identifier?.value || item.jobLocation?.addressLocality || title).slice(0, 100);
            const address = item.jobLocation?.address;
            const rawLoc = typeof address === 'string'
              ? address
              : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(', ') || 'Remote';

            const locNorm = normalizeLocation(rawLoc, { title });
            const fingerprint = generateFingerprint(companyName, title, locNorm.city);
            const applyUrl = item.url || careerUrl;

            jobs.push({
              source: 'universal',
              sourceJobId,
              company: companyName,
              title,
              location: locNorm.locationRaw,
              locationRaw: locNorm.locationRaw,
              city: locNorm.city,
              state: locNorm.state,
              country: locNorm.country,
              workMode: locNorm.workMode,
              fingerprint,
              descriptionHtml: item.description || '',
              applyUrl,
              updatedAt: item.datePosted ? new Date(item.datePosted) : new Date()
            });
          }
        }
      } catch (_) {}
    }

    console.log(`[UniversalFeed] Schema.org crawler found ${jobs.length} jobs for "${companyName}".`);
    return {
      success: true,
      error: null,
      jobs
    };
  } catch (err) {
    return {
      success: false,
      error: `Schema.org crawl failed: ${err.message}`,
      jobs: []
    };
  }
}

module.exports = {
  fetchUniversalJobs
};
