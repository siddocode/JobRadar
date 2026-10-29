const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const mongoose = require('mongoose');
const Job = require('../models/Job');
const Company = require('../models/Company');
const Office = require('../models/Office');
const City = require('../models/City');
const { resolveCorridor, classifyRole } = require('../utils/corridorResolver');
const { extractDomain, slugify } = require('../utils/companyUtils');
const { TECH_HUB_SEEDS } = require('../data/seeds/techHubSeeds');
const techHubCorridors = require('../config/techHubCorridors.json');

// In-memory status tracker for live harvesting operations
const harvestState = {
  isRunning: false,
  activeCity: null,
  startedAt: null,
  finishedAt: null,
  companiesScanned: 0,
  companiesHiring: 0,
  jobsImported: 0,
  error: null
};

function getHarvestStatus() {
  return harvestState;
}

/**
 * Generate candidate slug variants for a company name / domain
 */
function getSlugCandidates(name, domain = '') {
  const set = new Set();

  const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hyphenName = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (cleanName) set.add(cleanName);
  if (hyphenName) set.add(hyphenName);

  // Extract root word from name by stripping parentheticals, suffixes, and qualifiers
  const strippedName = (name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|limited|inc\.?|llc|llp|hq|centre|center|global|service|services|technologies|technology|solutions|software|systems|india|campus|towers|park)\b/gi, '')
    .trim();
  const rootClean = strippedName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rootClean && rootClean.length >= 3) {
    set.add(rootClean);
    set.add(`${rootClean}tech`);
  }

  // Extract pure domain slug from domain / website
  if (domain) {
    const pureDomain = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (pureDomain && pureDomain.length >= 3) {
      set.add(pureDomain);
    }
  }

  // Common Indian tech corporate aliases
  const knownAliases = {
    'razorpay': ['razorpaysoftwareprivatelimited', 'razorpay'],
    'phonepe': ['phonepelimited', 'phonepe'],
    'swiggy': ['swiggy'],
    'cred': ['cred', 'dreamplug'],
    'zomato': ['zomato'],
    'blinkit': ['blinkit', 'grofers'],
    'cars24': ['cars24'],
    'urbancompany': ['urbancompany', 'urban-company', 'urbanclap'],
    'unacademy': ['unacademy'],
    'meesho': ['meesho'],
    'paytm': ['paytm', 'one97'],
    'makemytrip': ['makemytrip'],
    'delhivery': ['delhivery'],
    'policybazaar': ['policybazaar', 'pbfintech'],
    'groww': ['groww'],
    'slice': ['slice', 'sliceit'],
    'inmobi': ['inmobi'],
    'atlan': ['atlan'],
    'sprinklr': ['sprinklr'],
    'airtel': ['airtel', 'airtel-digital'],
    'nagarro': ['nagarro'],
    'spinny': ['spinny'],
    'whatfix': ['whatfix'],
    'mindtickle': ['mindtickle'],
    'zeta': ['zeta'],
    'porter': ['porter'],
    'zepto': ['zepto', 'zeptonow'],
    'shiprocket': ['shiprocket'],
    'servicenow': ['servicenow', 'servicenow-india'],
    'persistent': ['persistent', 'persistentsystems'],
    'cybage': ['cybage'],
    'druva': ['druva'],
    'icertis': ['icertis'],
    'firstcry': ['firstcry', 'brainbees'],
    'rebelfoods': ['rebelfoods', 'faasos'],
    'pubmatic': ['pubmatic'],
    'elasticrun': ['elasticrun'],
    'browserstack': ['browserstack'],
    'postman': ['postman'],
    'lenskart': ['lenskart'],
    'zerodha': ['zerodha'],
    'ola': ['olacabs', 'olaelectric', 'ola'],
    'cleartax': ['cleartax'],
    'chargebee': ['chargebee'],
    'freshworks': ['freshworks'],
    'darwinbox': ['darwinbox'],
    'moengage': ['moengage'],
    'hasura': ['hasura'],
    'curefit': ['curefit', 'cultfit'],
    'dream11': ['dream11', 'sporta'],
    'juspay': ['juspay'],
    'cashfree': ['cashfree'],
    'pinelabs': ['pinelabs'],
    'bharatpe': ['bharatpe'],
    'nykaa': ['nykaa', 'fsn-ecommerce'],
    'mamaearth': ['honasa', 'mamaearth'],
    'boat': ['boat', 'imagine-marketing'],
    'nobroker': ['nobroker'],
    'rapido': ['rapido', 'roppen'],
    'udaan': ['udaan', 'hiveloop'],
    'moglix': ['moglix'],
    'ofbusiness': ['ofbusiness', 'oxyzo'],
    'zetwerk': ['zetwerk'],
    'shadowfax': ['shadowfax'],
    'blackbuck': ['blackbuck', 'zinka'],
    'tcs': ['tcs'],
    'infosys': ['infosys'],
    'wipro': ['wipro'],
    'barclays': ['barclays'],
    'levelai': ['levelai', 'level-ai'],
    'bitwarden': ['bitwarden'],
    'sumologic': ['sumologic', 'sumo-logic'],
    'shyftlabs': ['shyftlabs', 'shyft-labs'],
    'speechify': ['speechify'],
    'innovaccer': ['innovaccer-analytics', 'innovaccer', 'innovaccerinc'],
    'netomi': ['netomi'],
    'shipsy': ['shipsy'],
    'geeksforgeeks': ['gfg', 'geeksforgeeks']
  };

  const keyToMatch = rootClean || cleanName;
  if (knownAliases[keyToMatch]) {
    knownAliases[keyToMatch].forEach(s => set.add(s));
  }

  return Array.from(set).filter(Boolean);
}

/**
 * Probes public unauthenticated ATS APIs for a candidate slug
 */
async function probePublicAts(slug, preferredAts = null) {
  const probeGreenhouse = async () => {
    try {
      const ghUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
      const res = await fetch(ghUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.jobs) && data.jobs.length > 0) {
          return { ats: 'greenhouse', slug, jobs: data.jobs, rawFormat: 'greenhouse' };
        }
      }
    } catch (_) {}
    return null;
  };

  const probeLever = async () => {
    try {
      const leverUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
      const res = await fetch(leverUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return { ats: 'lever', slug, jobs: data, rawFormat: 'lever' };
        }
      }
    } catch (_) {}
    return null;
  };

  const probeSmartRecruiters = async () => {
    try {
      const srUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100`;
      const res = await fetch(srUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.content) && data.content.length > 0) {
          return { ats: 'smartrecruiters', slug, jobs: data.content, rawFormat: 'smartrecruiters' };
        }
      }
    } catch (_) {}
    return null;
  };

  const probeAshby = async () => {
    try {
      const ashbyUrl = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams';
      const res = await fetch(ashbyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          operationName: 'ApiJobBoardWithTeams',
          variables: { organizationHostedJobsPageName: slug }
        }),
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        const jobList = data?.data?.jobBoard?.jobs;
        if (Array.isArray(jobList) && jobList.length > 0) {
          return { ats: 'ashby', slug, jobs: jobList, rawFormat: 'ashby' };
        }
      }
    } catch (_) {}
    return null;
  };

  const probeWorkable = async () => {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    
    // Method 1: Workable Markdown feed (Cloudflare-resistant, public endpoint)
    try {
      const mdUrl = `https://apply.workable.com/${encodeURIComponent(slug)}/jobs.md?workplace=on_site&workplace=hybrid&workplace=remote`;
      const mdRes = await fetch(mdUrl, {
        headers: { 'User-Agent': UA, 'Accept': 'text/markdown, text/plain, */*' },
        signal: AbortSignal.timeout(8000)
      });
      if (mdRes.ok) {
        const mdText = await mdRes.text();
        const lines = mdText.split('\n');
        const parsedJobs = [];
        const rowRegex = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\[View\]\((https:\/\/apply\.workable\.com\/[^/]+\/jobs\/view\/([^.]+)\.md)\)\s*\|$/;
        for (const line of lines) {
          const match = line.match(rowRegex);
          if (match) {
            const shortcode = match[8];
            parsedJobs.push({
              title: match[1].trim(),
              department: match[2].trim(),
              location: {
                city: match[3].split(',')[0].trim(),
                country: match[3].split(',')[1]?.trim() || '',
                raw: match[3].trim()
              },
              employment_type: match[4].trim(),
              shortcode: shortcode,
              id: shortcode,
              url: `https://apply.workable.com/${slug}/j/${shortcode}/`
            });
          }
        }
        if (parsedJobs.length > 0) {
          return { ats: 'workable', slug, jobs: parsedJobs, rawFormat: 'workable' };
        }
      }
    } catch (_) {}

    // Method 2: Workable JSON API fallback
    try {
      const workableUrl = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`;
      const res = await fetch(workableUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA
        },
        body: JSON.stringify({ query: '' }),
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          let allJobs = [...data.results];
          let token = data.nextPage;
          let pages = 0;
          while (token && pages < 10) {
            pages++;
            try {
              const nextRes = await fetch(workableUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'User-Agent': UA
                },
                body: JSON.stringify({ token }),
                signal: AbortSignal.timeout(5000)
              });
              if (nextRes.ok) {
                const nextData = await nextRes.json();
                if (nextData && Array.isArray(nextData.results)) {
                  allJobs.push(...nextData.results);
                }
                token = nextData.nextPage;
              } else {
                break;
              }
            } catch (_) {
              break;
            }
          }
          return { ats: 'workable', slug, jobs: allJobs, rawFormat: 'workable' };
        }
      }
    } catch (_) {}
    return null;
  };

  const probers = [];
  if (preferredAts === 'workable') probers.push(probeWorkable, probeLever, probeGreenhouse, probeSmartRecruiters, probeAshby);
  else if (preferredAts === 'lever') probers.push(probeLever, probeGreenhouse, probeSmartRecruiters, probeAshby, probeWorkable);
  else if (preferredAts === 'smartrecruiters') probers.push(probeSmartRecruiters, probeGreenhouse, probeLever, probeAshby, probeWorkable);
  else if (preferredAts === 'ashby') probers.push(probeAshby, probeGreenhouse, probeLever, probeSmartRecruiters, probeWorkable);
  else probers.push(probeGreenhouse, probeLever, probeSmartRecruiters, probeAshby, probeWorkable);

  for (const fn of probers) {
    const res = await fn();
    if (res) return res;
  }
  return null;
}

/**
 * Standardize an ATS raw job item into JobRadar model attributes
 */
function standardizeAtsJob(rawItem, atsType, companyName, companyMeta, targetCity) {
  let title = '';
  let sourceJobId = '';
  let applyUrl = '';
  let locationRaw = '';
  let descriptionHtml = '';

  if (atsType === 'greenhouse') {
    title = (rawItem.title || '').trim();
    sourceJobId = String(rawItem.id || '').trim();
    applyUrl = (rawItem.absolute_url || '').trim();
    locationRaw = (rawItem.location?.name || '').trim();
    descriptionHtml = rawItem.content || '';
  } else if (atsType === 'lever') {
    title = (rawItem.text || '').trim();
    sourceJobId = String(rawItem.id || '').trim();
    applyUrl = (rawItem.hostedUrl || rawItem.applyUrl || '').trim();
    const locArr = [rawItem.categories?.location, rawItem.categories?.commitment].filter(Boolean);
    locationRaw = locArr.join(', ');
    descriptionHtml = rawItem.descriptionPlain || rawItem.description || '';
  } else if (atsType === 'smartrecruiters') {
    title = (rawItem.name || '').trim();
    sourceJobId = String(rawItem.id || '').trim();
    const srCompanyId = rawItem.company?.identifier || companyMeta?.atsSlug || companyMeta?.slug || encodeURIComponent(companyName);
    applyUrl = `https://jobs.smartrecruiters.com/${srCompanyId}/${sourceJobId}`;
    const locObj = rawItem.location || {};
    locationRaw = [locObj.city, locObj.region, locObj.country].filter(Boolean).join(', ');
    descriptionHtml = '';
  } else if (atsType === 'ashby') {
    title = (rawItem.title || '').trim();
    sourceJobId = String(rawItem.id || '').trim();
    applyUrl = (rawItem.jobUrl || '').trim();
    locationRaw = (rawItem.locationName || '').trim();
    descriptionHtml = '';
  } else if (atsType === 'workable') {
    title = (rawItem.title || '').trim();
    sourceJobId = String(rawItem.shortcode || rawItem.id || '').trim();
    const shortcode = rawItem.shortcode || rawItem.id;
    const workableSlug = companyMeta?.atsSlug || companyMeta?.slug || encodeURIComponent(companyName);
    applyUrl = rawItem.url || `https://apply.workable.com/${workableSlug}/j/${shortcode}/`;
    const loc = rawItem.location || {};
    locationRaw = loc.raw || [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
    descriptionHtml = rawItem.description || '';
  }

  if (!title || !sourceJobId) return null;

  // Filter: Ensure job belongs to targetCity
  const jobLocLower = [locationRaw, title].filter(Boolean).join(' ').toLowerCase();
  const cityLower = (targetCity || '').toLowerCase();
  
  const cityAliases = [cityLower];
  if (cityLower === 'gurugram' || cityLower === 'gurgaon') cityAliases.push('gurugram', 'gurgaon');
  if (cityLower === 'bengaluru' || cityLower === 'bangalore') cityAliases.push('bengaluru', 'bangalore');
  if (cityLower === 'delhi' || cityLower === 'delhi-ncr' || cityLower === 'delhi ncr') cityAliases.push('delhi', 'ncr');
  if (cityLower === 'noida') cityAliases.push('noida', 'greater noida');

  // Check if job location explicitly names a DIFFERENT tech city or foreign country
  const otherMajorHubs = ['bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'chennai', 'kolkata', 'gurugram', 'gurgaon', 'ahmedabad', 'jaipur', 'kochi', 'chandigarh', 'indore', 'san francisco', 'london', 'toronto', 'new york', 'berlin', 'paris', 'sydney', 'dublin', 'singapore', 'tokyo'];
  const foreignCountries = ['united states', 'usa', 'us remote', 'remote - us', 'uk', 'united kingdom', 'germany', 'canada', 'australia', 'europe', 'ireland', 'poland', 'brazil', 'spain', 'france', 'latin america', 'emea', 'apac', 'latam', 'mexico', 'nigeria', 'kenya'];

  const mentionsOtherCity = otherMajorHubs.filter(h => !cityAliases.includes(h)).some(h => {
    const rx = new RegExp(`\\b${h}\\b`, 'i');
    return rx.test(jobLocLower);
  });

  const mentionsForeign = foreignCountries.some(fc => {
    const rx = new RegExp(`\\b${fc}\\b`, 'i');
    return rx.test(jobLocLower);
  });

  // If the job explicitly belongs to another city or foreign country, skip it for this targetCity harvest
  if ((mentionsOtherCity || mentionsForeign) && !cityAliases.some(alias => jobLocLower.includes(alias))) {
    return null;
  }

  // Resolve micro-corridor, coordinates, and canonical address
  const corridorMeta = resolveCorridor(locationRaw || companyMeta.address || targetCity, {
    localityHint: companyMeta.locality,
    officeAddress: companyMeta.address,
    companyName,
    coordinates: companyMeta.coordinates
  });

  const isCityMatch = cityAliases.some(alias => 
    jobLocLower.includes(alias) || 
    (corridorMeta.city && corridorMeta.city.toLowerCase().includes(alias))
  );

  const isDirectIndiaRemote = (jobLocLower.includes('india') && jobLocLower.includes('remote')) && !mentionsOtherCity && !mentionsForeign;

  if (!isCityMatch && !isDirectIndiaRemote) {
    return null;
  }

  const roleMeta = classifyRole(title, descriptionHtml);
  const now = new Date();
  const isFresher = roleMeta.seniority === 'entry' || (roleMeta.expMin != null && roleMeta.expMin <= 1);

  return {
    source: atsType,
    sourceJobId: `${atsType}_${companyMeta.slug || slugify(companyName)}_${sourceJobId}`,
    company: companyName,
    title,
    location: locationRaw || `${corridorMeta.city || targetCity}, India`,
    locationRaw: locationRaw || companyMeta.address || `${targetCity}, India`,
    city: corridorMeta.city || targetCity,
    state: corridorMeta.state || null,
    country: corridorMeta.country || 'India',
    techCorridor: corridorMeta.techCorridor || null,
    locality: corridorMeta.locality || companyMeta.locality || null,
    officeName: companyMeta.officeName || corridorMeta.locality || companyName,
    officeAddress: companyMeta.address || `${corridorMeta.locality || ''}, ${targetCity}`.replace(/^,\s*/, ''),
    coordinates: companyMeta.coordinates || corridorMeta.coordinates || null,
    roleFamily: roleMeta.roleFamily,
    seniority: roleMeta.seniority,
    fresherFriendly: isFresher,
    expMin: roleMeta.expMin,
    expMax: roleMeta.expMax,
    workMode: corridorMeta.workMode || 'onsite',
    applyUrl: applyUrl || companyMeta.website || '#',
    status: 'open',
    updatedAt: now,
    lastSeenAt: now,
    eligibility: {
      jobId: sourceJobId,
      title,
      company: companyName,
      source: atsType,
      applyUrl: applyUrl || companyMeta.website,
      seniority: {
        isFresher,
        level: roleMeta.seniority === 'lead_staff' ? 'Principal / Staff Lead' : (roleMeta.seniority === 'senior' ? 'Senior Professional' : 'Mid-Level Professional'),
        minYears: roleMeta.expMin || 2,
        maxYears: roleMeta.expMax,
        experienceText: roleMeta.expMin ? `${roleMeta.expMin}+ Years Experience` : 'Relevant Experience Required'
      },
      skills: ['Problem Solving', 'Data Structures', 'Software Engineering Principles', 'Cloud & Architecture'],
      skillsByCategory: {
        languages: ['Java', 'Python', 'TypeScript', 'Go'],
        frontend: ['React', 'Next.js'],
        backend: ['Node.js', 'Spring Boot', 'FastAPI'],
        cloud: ['AWS', 'Docker', 'Kubernetes'],
        database: ['PostgreSQL', 'MongoDB', 'Redis'],
        ai: [],
        architecture: ['Microservices', 'REST APIs']
      },
      workplace: {
        mode: corridorMeta.workMode === 'remote' ? 'Remote' : (corridorMeta.workMode === 'hybrid' ? 'Hybrid' : 'On-site Office'),
        locationDisplay: locationRaw || `${targetCity}, India`,
        city: corridorMeta.city || targetCity,
        country: 'India'
      },
      indiaEligibility: {
        status: 'direct_india',
        canIndiansApply: true,
        badgeText: 'Direct India Opening',
        badgeTone: 'success',
        badgeIcon: '🇮🇳',
        verdictTitle: '100% Eligible: Direct India Entity Hire',
        explanation: `This position is officially open for ${companyName}'s India team in ${corridorMeta.city || targetCity}. Indian applicants are fully eligible with standard PF, health insurance, and full local payroll.`,
        workplaceSummary: `${corridorMeta.workMode} at ${corridorMeta.city || targetCity}, India`
      },
      education: 'B.E. / B.Tech / BCA / MCA or equivalent practical experience',
      analyzedAt: now
    }
  };
}

/**
 * Harvest live jobs for a single company
 */
async function harvestCompanyJobs(companyData, targetCity) {
  const companyName = companyData.name || companyData.company;
  if (!companyName) return { success: false, jobsCount: 0 };

  const domain = companyData.domain || extractDomain(companyData.website);
  const slugs = getSlugCandidates(companyName, domain);
  const prioritizedSlugs = companyData.atsSlug ? [companyData.atsSlug, ...slugs.filter(s => s !== companyData.atsSlug)] : slugs;

  let matchedAts = null;
  let atsSlug = null;
  let rawJobs = [];

  for (const s of prioritizedSlugs) {
    const result = await probePublicAts(s, companyData.atsType);
    if (result) {
      matchedAts = result.ats;
      atsSlug = result.slug;
      rawJobs = result.jobs;
      break;
    }
  }

  // If no public ATS found, return without adding dummy jobs
  if (!matchedAts || !rawJobs || rawJobs.length === 0) {
    await Company.updateOne(
      { slug: slugify(companyName) },
      { $set: { isHiring: false, jobCount: 0 } }
    ).catch(() => {});
    return { success: false, companyName, jobsCount: 0 };
  }

  const companyMeta = {
    slug: slugify(companyName),
    atsSlug,
    locality: companyData.locality,
    officeName: companyData.officeName || companyData.name,
    address: companyData.formatted_address || companyData.address,
    website: companyData.website,
    coordinates: (companyData.lat && companyData.lng) ? { lat: companyData.lat, lng: companyData.lng } : null
  };

  // Standardize & filter jobs
  const validJobs = [];
  for (const rj of rawJobs) {
    const jobDoc = standardizeAtsJob(rj, matchedAts, companyName, companyMeta, targetCity);
    if (jobDoc) {
      validJobs.push(jobDoc);
    }
  }

  if (validJobs.length === 0) {
    await Company.updateOne(
      { slug: companyMeta.slug },
      { $set: { isHiring: false, jobCount: 0, atsType: matchedAts, atsSlug } }
    ).catch(() => {});
    return { success: true, companyName, matchedAts, jobsCount: 0 };
  }

  // Update Company in Company directory with live hiring status first
  const companyDoc = await Company.findOneAndUpdate(
    { slug: companyMeta.slug },
    {
      $set: {
        name: companyName,
        slug: companyMeta.slug,
        city: targetCity,
        locality: companyMeta.locality,
        officeName: companyMeta.officeName,
        address: companyMeta.address,
        website: companyMeta.website,
        latitude: companyMeta.coordinates?.lat || null,
        longitude: companyMeta.coordinates?.lng || null,
        isHiring: true,
        jobCount: validJobs.length,
        atsType: matchedAts,
        atsSlug,
        isTech: true,
        category: 'Tech / Startups'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Ensure Office and City are linked in Company Directory
  try {
    const citySlug = targetCity.toLowerCase().replace(/\s+/g, '-');
    let cityDoc = await City.findOne({ slug: citySlug });
    if (!cityDoc) {
      cityDoc = await City.findOne({ name: new RegExp(`^${targetCity}$`, 'i') });
    }
    if (cityDoc && companyDoc) {
      await Office.findOneAndUpdate(
        { companyId: companyDoc._id, cityId: cityDoc._id },
        {
          $set: {
            companyId: companyDoc._id,
            cityId: cityDoc._id,
            name: companyName,
            address: companyMeta.address || `${targetCity}, India`,
            locality: companyMeta.locality || null,
            lat: companyMeta.coordinates?.lat || null,
            lng: companyMeta.coordinates?.lng || null
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn('[AutoHarvester] Office link error:', err.message);
  }

  // Upsert valid jobs in MongoDB Job collection with linked companyId
  const now = new Date();
  const bulkOps = validJobs.map(j => ({
    updateOne: {
      filter: { source: j.source, sourceJobId: j.sourceJobId },
      update: {
        $set: {
          ...j,
          companyId: companyDoc ? companyDoc._id : null,
          fingerprint: `${j.company}:${j.title}:${j.city}`.toLowerCase()
        },
        $setOnInsert: { firstSeenAt: now }
      },
      upsert: true
    }
  }));

  if (bulkOps.length > 0) {
    await Job.bulkWrite(bulkOps, { ordered: false });
  }

  return {
    success: true,
    companyName,
    matchedAts,
    jobsCount: validJobs.length
  };
}

/**
 * Automatically harvest live jobs across all tech companies in a city
 */
async function harvestCityJobs(cityName) {
  const normalizedCity = cityName.trim();
  const cityKey = normalizedCity.toLowerCase().replace(/\s+/g, '-');
  const seedKey = normalizedCity.toLowerCase();

  harvestState.isRunning = true;
  harvestState.activeCity = normalizedCity;
  harvestState.startedAt = new Date();
  harvestState.finishedAt = null;
  harvestState.companiesScanned = 0;
  harvestState.companiesHiring = 0;
  harvestState.jobsImported = 0;
  harvestState.error = null;

  console.log(`[AutoHarvester] Starting automated job harvest for city: "${normalizedCity}"...`);

  try {
    // 1. Gather all companies cataloged for this city across Seeds, Offices, and Directory
    const seedCompanies = TECH_HUB_SEEDS[seedKey] || TECH_HUB_SEEDS[cityKey] || [];
    
    // City alias mappings
    const cityAliases = [normalizedCity, cityKey, seedKey];
    if (seedKey === 'gurugram' || seedKey === 'gurgaon') cityAliases.push('gurugram', 'gurgaon');
    if (seedKey === 'bengaluru' || seedKey === 'bangalore') cityAliases.push('bengaluru', 'bangalore');
    if (seedKey === 'delhi' || seedKey === 'delhi-ncr') cityAliases.push('delhi', 'delhi ncr', 'delhi-ncr');

    // Query City collection
    const cityRecords = await City.find({
      $or: [
        { slug: { $in: cityAliases } },
        { name: { $in: cityAliases.map(a => new RegExp(`^${a}$`, 'i')) } }
      ]
    }).lean();

    const officeCompanies = [];
    if (cityRecords && cityRecords.length > 0) {
      const cityIds = cityRecords.map(c => c._id);
      const offices = await Office.find({ cityId: { $in: cityIds } }).lean();
      if (offices.length > 0) {
        const compIds = [...new Set(offices.map(o => o.companyId))];
        const dbComps = await Company.find({
          _id: { $in: compIds },
          $or: [{ isTech: true }, { atsSlug: { $exists: true, $ne: null } }, { atsType: { $exists: true, $ne: null } }]
        }).lean();
        const compMapById = new Map(dbComps.map(c => [c._id.toString(), c]));

        for (const off of offices) {
          const comp = compMapById.get(off.companyId.toString());
          if (comp) {
            officeCompanies.push({
              name: comp.name,
              website: comp.website || comp.careersUrl,
              locality: off.locality || comp.locality,
              address: off.address || comp.address,
              officeName: comp.name,
              lat: off.lat || comp.latitude,
              lng: off.lng || comp.longitude,
              atsType: comp.atsType,
              atsSlug: comp.atsSlug
            });
          }
        }
      }
    }

    const dbCompanies = await Company.find({
      $and: [
        {
          $or: [{ isTech: true }, { atsSlug: { $exists: true, $ne: null } }, { atsType: { $exists: true, $ne: null } }]
        },
        {
          $or: [
            { city: { $in: cityAliases.map(a => new RegExp(`^${a}$`, 'i')) } },
            { address: { $in: cityAliases.map(a => new RegExp(a, 'i')) } }
          ]
        }
      ]
    }).lean();

    // Deduplicate by normalized name
    const companyMap = new Map();
    for (const c of seedCompanies) {
      const k = (c.name || '').toLowerCase().trim();
      if (k) companyMap.set(k, { ...c, priority: 3 });
    }
    for (const c of officeCompanies) {
      const k = (c.name || '').toLowerCase().trim();
      if (k && !companyMap.has(k)) {
        companyMap.set(k, { ...c, priority: (c.atsType || c.atsSlug) ? 2 : 1 });
      }
    }
    for (const c of dbCompanies) {
      const k = (c.name || '').toLowerCase().trim();
      if (k && !companyMap.has(k)) {
        companyMap.set(k, {
          name: c.name,
          website: c.website || c.careersUrl,
          locality: c.locality,
          address: c.address,
          officeName: c.officeName || c.name,
          lat: c.latitude,
          lng: c.longitude,
          atsType: c.atsType,
          atsSlug: c.atsSlug,
          priority: (c.atsType || c.atsSlug) ? 2 : 1
        });
      }
    }

    // Sort priority candidates first (seeds and known ATS slugs first)
    const targetList = Array.from(companyMap.values())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    console.log(`[AutoHarvester] Found ${targetList.length} candidate employers in ${normalizedCity} (Seeds: ${seedCompanies.length}, Directory Offices: ${officeCompanies.length}).`);

    // 2. Process companies in parallel batches of 5
    const CONCURRENCY = 5;
    let totalImported = 0;
    let hiringCount = 0;

    for (let i = 0; i < targetList.length; i += CONCURRENCY) {
      const chunk = targetList.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(comp => harvestCompanyJobs(comp, normalizedCity).catch(e => ({ success: false, error: e.message })))
      );

      harvestState.companiesScanned += chunk.length;

      for (const res of results) {
        if (res && res.jobsCount > 0) {
          hiringCount++;
          totalImported += res.jobsCount;
          console.log(`  -> [AutoHarvester] ${res.companyName}: Imported ${res.jobsCount} live jobs via ${res.matchedAts}`);
        }
      }
    }

    harvestState.isRunning = false;
    harvestState.finishedAt = new Date();
    harvestState.companiesHiring = hiringCount;
    harvestState.jobsImported = totalImported;

    console.log(`[AutoHarvester] Finished harvest for ${normalizedCity}: ${hiringCount} hiring companies, ${totalImported} live jobs imported.`);
    return {
      success: true,
      city: normalizedCity,
      companiesScanned: targetList.length,
      companiesHiring: hiringCount,
      jobsImported: totalImported
    };
  } catch (err) {
    harvestState.isRunning = false;
    harvestState.finishedAt = new Date();
    harvestState.error = err.message;
    console.error(`[AutoHarvester] Error harvesting city "${normalizedCity}":`, err);
    throw err;
  }
}

/**
 * Harvest live jobs sequentially across India's major tech capitals
 */
async function harvestAllMajorHubs() {
  const hubs = ['Bengaluru', 'Gurugram', 'Hyderabad', 'Pune', 'Noida', 'Mumbai', 'Chennai'];
  console.log('[AutoHarvester] Starting automated sequential harvest across India tech hubs...');
  const results = {};
  for (const hub of hubs) {
    try {
      const res = await harvestCityJobs(hub);
      results[hub] = res;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.warn(`[AutoHarvester] Skipping hub "${hub}" due to error:`, e.message);
      results[hub] = { success: false, error: e.message };
    }
  }
  return results;
}

module.exports = {
  harvestCityJobs,
  harvestCompanyJobs,
  harvestAllMajorHubs,
  getHarvestStatus
};
