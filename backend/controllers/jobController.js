const Job = require('../models/Job');
const SourceRun = require('../models/SourceRun');
const { analyzeJobEligibility } = require('../services/eligibilityAnalyzer');
const { parseCvPdf, parsePortfolioUrl, extractCandidateProfile } = require('../services/candidateParser');
const { evaluateCandidateEligibility } = require('../services/eligibilityMatcher');
const { tailorCandidateResume } = require('../services/cvTailorService');
const { calculateDistanceKm, resolveItemCoordinates } = require('../utils/geoUtils');

/**
 * GET /api/jobs
 * Query filters:
 * - q: text search on job title (case-insensitive regex)
 * - city: filter by canonical city (e.g. "Bengaluru", "Hyderabad", "Kolkata")
 * - state: filter by state (e.g. "Karnataka", "Telangana")
 * - country: filter by country (e.g. "India")
 * - workMode: 'onsite' | 'hybrid' | 'remote' | 'unknown'
 * - location: text search on locationRaw
 * - status: 'open' | 'closed' | 'all' (default: 'open')
 * - company: filter by company name
 * - limit: max results (default 50, max 500)
 * - page: page number (1-indexed)
 */
async function getJobs(req, res) {
  try {
    const {
      q,
      city,
      state,
      country,
      workMode,
      location,
      status,
      company,
      techOnly,
      corridor,
      fresherFriendly,
      seniority,
      expMax,
      userLat,
      userLng,
      sortBy,
      maxDistanceKm,
      limit = 50,
      page = 1
    } = req.query;

    const filter = {};

    // Filter by title keyword (q)
    if (q && typeof q === 'string' && q.trim()) {
      const sanitizedQ = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: sanitizedQ, $options: 'i' };
    }

    // Filter by tech roles only (coding, software engineering, AI, DevOps, data, product)
    if (techOnly === 'true' || techOnly === true) {
      const techRoleRegex = /(engineer|engineering|developer|development|software|swe|coder|coding|programmer|frontend|front-end|backend|back-end|fullstack|full-stack|devops|sre|reliability|cloud|infrastructure|architect|data|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|computer vision|\bllm\b|quality assurance|\bqa\b|\bsdet\b|test|tester|automation|security|cybersecurity|infosec|product manager|technical product|\btpm\b|technical program|tech lead|platform|database|\bdba\b|embedded|firmware|hardware|network|systems|solutions architect|webmaster|sysadmin)/i;

      if (filter.title) {
        filter.$and = [
          { title: filter.title },
          { title: { $regex: techRoleRegex } }
        ];
        delete filter.title;
      } else {
        filter.title = { $regex: techRoleRegex };
      }
    }

    // Helper to safely append $or clauses without collision
    const addOrFilter = (conds) => {
      if (filter.$or) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push({ $or: filter.$or });
        delete filter.$or;
      }
      if (filter.$and) {
        filter.$and.push({ $or: conds });
      } else {
        filter.$or = conds;
      }
    };

    // Filter by city (with multi-name alias support)
    if (city && typeof city === 'string' && city.trim() && city !== 'all') {
      const cLower = city.trim().toLowerCase();
      let cityRegexPattern = `^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
      if (cLower === 'gurugram' || cLower === 'gurgaon') cityRegexPattern = '^(gurugram|gurgaon)$';
      else if (cLower === 'bengaluru' || cLower === 'bangalore') cityRegexPattern = '^(bengaluru|bangalore)$';
      else if (cLower === 'delhi' || cLower === 'new delhi' || cLower === 'delhi-ncr' || cLower === 'delhi ncr') cityRegexPattern = '^(delhi|new delhi|delhi-ncr|delhi ncr)$';
      else if (cLower === 'noida' || cLower === 'greater noida') cityRegexPattern = '^(noida|greater noida)$';
      filter.city = { $regex: new RegExp(cityRegexPattern, 'i') };
    }

    // Filter by tech corridor (e.g. orr_bellandur, hitec_city, cyber_city, hinjawadi)
    if (corridor && typeof corridor === 'string' && corridor.trim() && corridor !== 'all') {
      filter.techCorridor = corridor.trim();
    }

    // Filter by fresher / early career friendly
    if (fresherFriendly === 'true' || fresherFriendly === true) {
      addOrFilter([
        { fresherFriendly: true },
        { seniority: 'entry' },
        { seniority: 'intern' },
        { expMin: { $lte: 1 } }
      ]);
    }

    // Filter by seniority ('entry' | 'mid' | 'senior' | 'lead_staff' | 'manager' | 'director_plus')
    if (seniority && typeof seniority === 'string' && seniority.trim() && seniority !== 'all') {
      filter.seniority = seniority.trim().toLowerCase();
    }

    // Filter by max required experience
    if (expMax && !isNaN(parseInt(expMax, 10))) {
      const maxExp = parseInt(expMax, 10);
      filter.expMin = { $lte: maxExp };
    }

    // Filter by state
    if (state && typeof state === 'string' && state.trim() && state !== 'all') {
      const sanitizedState = state.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.state = { $regex: new RegExp(`^${sanitizedState}$`, 'i') };
    }

    // Filter by country
    if (country && typeof country === 'string' && country.trim() && country !== 'all') {
      const sanitizedCountry = country.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.country = { $regex: new RegExp(`^${sanitizedCountry}$`, 'i') };
    }

    // Filter by workMode ('onsite' | 'hybrid' | 'remote' | 'unknown')
    if (workMode && typeof workMode === 'string' && workMode.trim() && workMode !== 'all') {
      const mode = workMode.toLowerCase().trim();
      if (['onsite', 'hybrid', 'remote', 'unknown'].includes(mode)) {
        filter.workMode = mode;
      }
    }

    // Filter by raw location text search
    if (location && typeof location === 'string' && location.trim()) {
      const sanitizedLoc = location.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      addOrFilter([
        { locationRaw: { $regex: sanitizedLoc, $options: 'i' } },
        { location: { $regex: sanitizedLoc, $options: 'i' } },
        { locality: { $regex: sanitizedLoc, $options: 'i' } },
        { officeName: { $regex: sanitizedLoc, $options: 'i' } }
      ]);
    }

    // Filter by status ('open', 'closed', 'all') - default: 'open'
    if (status && status !== 'all') {
      if (['open', 'closed'].includes(status.toLowerCase())) {
        filter.status = status.toLowerCase();
      }
    }

    // Filter by company (case-insensitive regex)
    if (company && typeof company === 'string' && company.trim() && company !== 'all') {
      const sanitizedCompany = company.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.company = { $regex: new RegExp(`^${sanitizedCompany}$`, 'i') };
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    // Proximity parameters
    const numUserLat = userLat != null && userLat !== '' ? parseFloat(userLat) : null;
    const numUserLng = userLng != null && userLng !== '' ? parseFloat(userLng) : null;
    const hasUserLocation = numUserLat != null && numUserLng != null && !isNaN(numUserLat) && !isNaN(numUserLng);
    const maxDist = maxDistanceKm ? parseFloat(maxDistanceKm) : null;
    const isSortByDistance = hasUserLocation && (sortBy === 'distance' || maxDist != null);

    let jobs = [];
    let totalCount = 0;
    let openCount = 0;
    let totalInDb = 0;

    if (isSortByDistance) {
      // High-speed database-level proximity aggregation across all matching jobs
      const proximityPipeline = [
        { $match: filter },
        {
          $addFields: {
            rawLat: {
              $cond: [
                { $and: [{ $ne: ['$coordinates.lat', null] }, { $isNumber: '$coordinates.lat' }] },
                '$coordinates.lat',
                {
                  $switch: {
                    branches: [
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /kolkata/i } }, then: 22.5726 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /bengaluru|bangalore/i } }, then: 12.9716 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /hyderabad/i } }, then: 17.3850 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /gurgaon|gurugram/i } }, then: 28.4595 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /delhi/i } }, then: 28.6139 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /noida/i } }, then: 28.5355 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /pune/i } }, then: 18.5204 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /mumbai/i } }, then: 19.0760 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /chennai/i } }, then: 13.0827 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /ahmedabad/i } }, then: 23.0350 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /jaipur/i } }, then: 26.9000 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /kochi/i } }, then: 10.0000 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /chandigarh/i } }, then: 30.7300 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /indore/i } }, then: 22.7250 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /bhubaneswar/i } }, then: 20.2850 }
                    ],
                    default: null
                  }
                }
              ]
            },
            rawLng: {
              $cond: [
                { $and: [{ $ne: ['$coordinates.lng', null] }, { $isNumber: '$coordinates.lng' }] },
                '$coordinates.lng',
                {
                  $switch: {
                    branches: [
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /kolkata/i } }, then: 88.3639 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /bengaluru|bangalore/i } }, then: 77.5946 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /hyderabad/i } }, then: 78.4867 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /gurgaon|gurugram/i } }, then: 77.0266 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /delhi/i } }, then: 77.2090 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /noida/i } }, then: 77.3910 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /pune/i } }, then: 73.8567 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /mumbai/i } }, then: 72.8777 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /chennai/i } }, then: 80.2707 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /ahmedabad/i } }, then: 72.5800 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /jaipur/i } }, then: 75.8000 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /kochi/i } }, then: 76.3000 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /chandigarh/i } }, then: 76.7750 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /indore/i } }, then: 75.8750 },
                      { case: { $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: /bhubaneswar/i } }, then: 85.8250 }
                    ],
                    default: null
                  }
                }
              ]
            }
          }
        },
        {
          $addFields: {
            distApprox: {
              $cond: [
                { $and: [{ $isNumber: '$rawLat' }, { $isNumber: '$rawLng' }] },
                {
                  $add: [
                    { $pow: [{ $subtract: ['$rawLat', numUserLat] }, 2] },
                    { $pow: [{ $subtract: ['$rawLng', numUserLng] }, 2] }
                  ]
                },
                99999999
              ]
            }
          }
        }
      ];

      if (maxDist && !isNaN(maxDist)) {
        const degRadius = maxDist / 95;
        const degRadiusSq = degRadius * degRadius;
        proximityPipeline.push({ $match: { distApprox: { $lte: degRadiusSq } } });
      }

      const [countAgg, jobsList, oCount, tInDb] = await Promise.all([
        Job.aggregate([...proximityPipeline, { $count: 'total' }]),
        Job.aggregate([
          ...proximityPipeline,
          { $sort: { distApprox: 1, lastSeenAt: -1, updatedAt: -1 } },
          { $skip: skip },
          { $limit: parsedLimit },
          {
            $project: {
              source: 1,
              sourceJobId: 1,
              company: 1,
              title: 1,
              location: 1,
              locationRaw: 1,
              city: 1,
              state: 1,
              country: 1,
              techCorridor: 1,
              locality: 1,
              officeName: 1,
              officeAddress: 1,
              coordinates: 1,
              roleFamily: 1,
              seniority: 1,
              fresherFriendly: 1,
              expMin: 1,
              expMax: 1,
              workMode: 1,
              fingerprint: 1,
              applyUrl: 1,
              updatedAt: 1,
              firstSeenAt: 1,
              lastSeenAt: 1,
              status: 1,
              descriptionHtml: 1,
              rawLat: 1,
              rawLng: 1
            }
          }
        ]),
        Job.countDocuments({ status: 'open' }),
        Job.countDocuments()
      ]);

      jobs = jobsList;
      totalCount = countAgg[0]?.total || 0;
      openCount = oCount;
      totalInDb = tInDb;
    } else {
      // Default query: newest verified jobs first
      const [jobsList, tCount, oCount, tInDb] = await Promise.all([
        Job.find(filter)
          .sort({ lastSeenAt: -1, updatedAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .select('source sourceJobId company title location locationRaw city state country techCorridor locality officeName officeAddress coordinates roleFamily seniority fresherFriendly expMin expMax workMode fingerprint applyUrl updatedAt firstSeenAt lastSeenAt status descriptionHtml')
          .lean(),
        Job.countDocuments(filter),
        Job.countDocuments({ status: 'open' }),
        Job.countDocuments()
      ]);

      jobs = jobsList;
      totalCount = tCount;
      openCount = oCount;
      totalInDb = tInDb;
    }

    // Cross-source deduplication linking:
    // If multiple records share the same fingerprint, link duplicates and prefer ATS record over aggregator
    const deduplicatedJobs = [];
    const seenFingerprints = new Map();

    const ATS_PRIORITY = {
      greenhouse: 4,
      lever: 3,
      ashby: 3,
      smartrecruiters: 3,
      adzuna: 1
    };

    for (const job of jobs) {
      const fp = job.fingerprint || `${job.company}:${job.title}:${job.city || 'none'}`;
      if (!seenFingerprints.has(fp)) {
        job.linkedSources = [{ source: job.source, sourceJobId: job.sourceJobId, applyUrl: job.applyUrl }];
        seenFingerprints.set(fp, job);
        deduplicatedJobs.push(job);
      } else {
        const existing = seenFingerprints.get(fp);
        existing.linkedSources.push({ source: job.source, sourceJobId: job.sourceJobId, applyUrl: job.applyUrl });
        // If current job has higher source priority, prefer its details
        const currPriority = ATS_PRIORITY[job.source] || 2;
        const existPriority = ATS_PRIORITY[existing.source] || 2;
        if (currPriority > existPriority) {
          existing.source = job.source;
          existing.applyUrl = job.applyUrl;
          existing.sourceJobId = job.sourceJobId;
          if (job.descriptionHtml) {
            existing.descriptionHtml = job.descriptionHtml;
          }
        }
      }
    }

    // Attach precomputed eligibility and calculate distance if user location provided
    for (const job of deduplicatedJobs) {
      job.eligibility = analyzeJobEligibility(job);
      delete job.descriptionHtml;

      if (hasUserLocation) {
        const lat = job.rawLat != null ? job.rawLat : (job.coordinates?.lat || resolveItemCoordinates(job)?.lat);
        const lng = job.rawLng != null ? job.rawLng : (job.coordinates?.lng || resolveItemCoordinates(job)?.lng);
        if (lat != null && lng != null) {
          job.distanceKm = calculateDistanceKm(numUserLat, numUserLng, lat, lng);
        } else {
          job.distanceKm = null;
        }
      } else {
        job.distanceKm = null;
      }
    }

    let finalJobs = deduplicatedJobs;
    if (isSortByDistance) {
      finalJobs.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    return res.status(200).json({
      success: true,
      meta: {
        total: totalCount,
        openTotal: openCount,
        totalInDb,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit) || 1,
        userLocationApplied: hasUserLocation
      },
      jobs: finalJobs
    });
  } catch (error) {
    console.error('[jobController:getJobs] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve jobs',
      message: error.message
    });
  }
}

/**
 * GET /api/cities
 * Returns cities that actually have jobs, with job counts.
 */
async function getCities(req, res) {
  try {
    const { status, country } = req.query;
    const match = {
      city: { $ne: null, $nin: ['', null] }
    };

    if (status && status !== 'all') {
      match.status = status.toLowerCase();
    } else {
      // Default to open jobs for city discovery
      match.status = 'open';
    }

    if (country && country !== 'all') {
      match.country = { $regex: new RegExp(`^${country.trim()}$`, 'i') };
    }

    const cityStats = await Job.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 },
          state: { $first: '$state' },
          country: { $first: '$country' }
        }
      },
      { $sort: { count: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          city: '$_id',
          count: 1,
          state: 1,
          country: 1
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      totalCities: cityStats.length,
      cities: cityStats
    });
  } catch (error) {
    console.error('[jobController:getCities] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve cities',
      message: error.message
    });
  }
}

/**
 * GET /api/corridors
 * Query param: city (e.g. "Bengaluru", "Hyderabad", "Gurugram", "Pune", "Noida", "New Delhi", "Mumbai", "Chennai")
 * Returns configured tech corridors for the city with active job counts.
 */
async function getCorridors(req, res) {
  try {
    const { city, status = 'open' } = req.query;
    const techHubCorridors = require('../config/techHubCorridors.json');

    // Return all corridors across all cities if requested
    if (req.query.allCorridors === 'true') {
      const match = {};
      if (status !== 'all') match.status = status;

      const corridorCounts = await Job.aggregate([
        { $match: match },
        { $group: { _id: '$techCorridor', count: { $sum: 1 } } }
      ]);
      const countMap = new Map();
      for (const item of corridorCounts) {
        if (item._id) countMap.set(item._id, item.count);
      }

      const allCorridors = [];
      for (const [cityName, cityData] of Object.entries(techHubCorridors.cities)) {
        for (const [corridorKey, cData] of Object.entries(cityData.corridors || {})) {
          allCorridors.push({
            city: cityName,
            key: corridorKey,
            name: cData.name,
            shortName: cData.shortName,
            center: cData.center,
            count: countMap.get(corridorKey) || 0
          });
        }
      }

      return res.status(200).json({
        success: true,
        city: 'all',
        corridors: allCorridors
      });
    }

    if (!city || city === 'all') {
      const match = {};
      if (status !== 'all') match.status = status;

      const cityCounts = await Job.aggregate([
        { $match: match },
        { $group: { _id: '$city', count: { $sum: 1 } } }
      ]);
      const countMap = new Map();
      for (const item of cityCounts) {
        if (item._id) countMap.set(item._id.toLowerCase(), item.count);
      }

      const hubs = Object.entries(techHubCorridors.cities).map(([cityName, data]) => ({
        key: cityName.toLowerCase(),
        city: cityName,
        state: data.state,
        country: data.country,
        center: data.center,
        count: countMap.get(cityName.toLowerCase()) || 0,
        corridorsCount: Object.keys(data.corridors || {}).length
      })).sort((a, b) => b.count - a.count);

      return res.status(200).json({ success: true, city: 'all', hubs, corridors: [] });
    }

    const canonicalKey = Object.keys(techHubCorridors.cities).find(
      c => c.toLowerCase() === city.trim().toLowerCase()
    );

    if (!canonicalKey || !techHubCorridors.cities[canonicalKey]?.corridors) {
      return res.status(200).json({ success: true, city, corridors: [] });
    }

    const configuredCorridors = techHubCorridors.cities[canonicalKey].corridors;

    const match = {
      city: { $regex: new RegExp(`^${canonicalKey}$`, 'i') }
    };
    if (status !== 'all') {
      match.status = status;
    }

    const corridorCounts = await Job.aggregate([
      { $match: match },
      { $group: { _id: '$techCorridor', count: { $sum: 1 } } }
    ]);

    const countMap = new Map();
    for (const item of corridorCounts) {
      if (item._id) countMap.set(item._id, item.count);
    }

    const result = Object.entries(configuredCorridors).map(([key, data]) => ({
      key,
      name: data.name,
      shortName: data.shortName,
      center: data.center,
      count: countMap.get(key) || 0
    }));

    return res.status(200).json({
      success: true,
      city: canonicalKey,
      corridors: result
    });
  } catch (error) {
    console.error('[jobController:getCorridors] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve corridors',
      message: error.message
    });
  }
}

/**
 * GET /api/countries or /api/jobs/countries
 * Returns countries that have jobs, with job counts.
 */
async function getCountries(req, res) {
  try {
    const { status } = req.query;
    const match = {
      country: { $ne: null, $nin: ['', null] }
    };

    if (status && status !== 'all') {
      match.status = status.toLowerCase();
    } else {
      match.status = 'open';
    }

    const countryStats = await Job.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          country: '$_id',
          count: 1
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      totalCountries: countryStats.length,
      countries: countryStats
    });
  } catch (error) {
    console.error('[jobController:getCountries] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve countries',
      message: error.message
    });
  }
}

/**
 * GET /api/jobs/stats
 * Provides aggregate stats for dashboard metrics.
 */
async function getJobStats(req, res) {
  try {
    const [total, open, closed, companies, citiesCount, latestRuns] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: 'open' }),
      Job.countDocuments({ status: 'closed' }),
      Job.distinct('company'),
      Job.distinct('city', { city: { $ne: null } }),
      SourceRun.find().sort({ createdAt: -1 }).limit(10).lean()
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        total,
        open,
        closed,
        companiesCount: companies.length,
        companies,
        citiesCount: citiesCount.length,
        latestRuns
      }
    });
  } catch (error) {
    console.error('[jobController:getJobStats] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve job statistics',
      message: error.message
    });
  }
}

// In-memory sync state
const syncState = {
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastSummary: null,
  error: null
};

/**
 * POST /api/jobs/sync
 * Triggers an on-demand ingestion run in the background.
 */
async function triggerSync(req, res) {
  try {
    if (syncState.isRunning) {
      return res.status(200).json({
        success: true,
        message: 'A job sync is already in progress.',
        syncState
      });
    }

    syncState.isRunning = true;
    syncState.startedAt = new Date();
    syncState.finishedAt = null;
    syncState.error = null;

    // Run collection asynchronously in the background
    const { runCollection } = require('../scripts/collect');
    runCollection()
      .then((summary) => {
        syncState.isRunning = false;
        syncState.finishedAt = new Date();
        syncState.lastSummary = summary;
        console.log('[Sync] Collection run finished successfully.');
      })
      .catch((err) => {
        syncState.isRunning = false;
        syncState.finishedAt = new Date();
        syncState.error = err.message || 'Collection encountered an error';
        console.error('[Sync] Collection run failed:', err);
      });

    return res.status(202).json({
      success: true,
      message: 'Sync started successfully in the background.',
      syncState
    });
  } catch (error) {
    console.error('[jobController:triggerSync] Error:', error);
    syncState.isRunning = false;
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate sync',
      message: error.message
    });
  }
}

/**
 * GET /api/jobs/sync/status
 * Returns current sync status and latest summary.
 */
async function getSyncStatus(req, res) {
  return res.status(200).json({
    success: true,
    syncState
  });
}

/**
 * GET /api/jobs/:id/eligibility
 * Returns detailed eligibility metrics, freshers fit, skills, and work authorization.
 */
async function getJobEligibility(req, res) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Job ID parameter is required' });
    }

    let job = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      job = await Job.findById(id).lean();
    }
    if (!job) {
      job = await Job.findOne({ sourceJobId: id }).lean();
    }
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const eligibility = analyzeJobEligibility(job);

    return res.status(200).json({
      success: true,
      eligibility
    });
  } catch (error) {
    console.error('[jobController:getJobEligibility] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze job eligibility',
      message: error.message
    });
  }
}

/**
 * POST /api/jobs/candidate/parse-cv
 * Handles PDF CV upload, extracts text, and parses structured candidate profile
 */
async function parseCandidateCv(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CV file uploaded. Please upload a PDF document.'
      });
    }

    const originalName = req.file.originalname || 'Resume.pdf';
    console.log(`[jobController:parseCandidateCv] Parsing uploaded CV: ${originalName} (${req.file.size} bytes)`);

    const rawText = await parseCvPdf(req.file.buffer);
    const profile = extractCandidateProfile(rawText, {
      sourceType: 'pdf',
      sourceName: originalName
    });

    if (req.user && req.user.id) {
      try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user.id, { candidateProfile: profile });
      } catch (userErr) {
        console.warn('[jobController:parseCandidateCv] Could not sync to user record:', userErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'CV successfully parsed',
      profile
    });
  } catch (error) {
    console.error('[jobController:parseCandidateCv] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse CV PDF'
    });
  }
}

/**
 * POST /api/jobs/candidate/parse-url
 * Fetches candidate portfolio website, strips HTML, and parses structured candidate profile
 */
async function parseCandidateUrl(req, res) {
  try {
    const { portfolioUrl } = req.body;
    if (!portfolioUrl || typeof portfolioUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Portfolio site URL is required (e.g., https://myportfolio.com)'
      });
    }

    console.log(`[jobController:parseCandidateUrl] Fetching portfolio: ${portfolioUrl}`);
    const rawText = await parsePortfolioUrl(portfolioUrl);
    const profile = extractCandidateProfile(rawText, {
      sourceType: 'url',
      sourceName: portfolioUrl
    });

    if (req.user && req.user.id) {
      try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user.id, { candidateProfile: profile });
      } catch (userErr) {
        console.warn('[jobController:parseCandidateUrl] Could not sync to user record:', userErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Portfolio successfully fetched and parsed',
      profile
    });
  } catch (error) {
    console.error('[jobController:parseCandidateUrl] Error:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to parse portfolio URL'
    });
  }
}

/**
 * POST /api/jobs/:id/check-candidate-eligibility
 * Evaluates candidate profile (passed in body, or extracted) against a specific job
 */
async function checkCandidateEligibility(req, res) {
  try {
    const { id } = req.params;
    let { candidateProfile, portfolioUrl } = req.body || {};

    let job = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      job = await Job.findById(id).lean();
    }
    if (!job) {
      job = await Job.findOne({ sourceJobId: id }).lean();
    }
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // If PDF file was uploaded in this request
    if (req.file) {
      const rawText = await parseCvPdf(req.file.buffer);
      candidateProfile = extractCandidateProfile(rawText, {
        sourceType: 'pdf',
        sourceName: req.file.originalname || 'Uploaded CV'
      });
    } else if (!candidateProfile && portfolioUrl) {
      const rawText = await parsePortfolioUrl(portfolioUrl);
      candidateProfile = extractCandidateProfile(rawText, {
        sourceType: 'url',
        sourceName: portfolioUrl
      });
    }

    if (!candidateProfile) {
      return res.status(400).json({
        success: false,
        error: 'Candidate profile data, CV file, or portfolioUrl is required'
      });
    }

    const jobEligibility = analyzeJobEligibility(job);
    const candidateMatch = evaluateCandidateEligibility(jobEligibility, candidateProfile);

    return res.status(200).json({
      success: true,
      jobEligibility,
      candidateProfile,
      candidateMatch
    });
  } catch (error) {
    console.error('[jobController:checkCandidateEligibility] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to evaluate candidate eligibility',
      message: error.message
    });
  }
}

/**
 * POST /api/jobs/evaluate-candidate
 * Evaluates candidate profile against any arbitrary job payload
 */
async function evaluateDirectMatch(req, res) {
  try {
    const { job, candidateProfile } = req.body;
    if (!job || !candidateProfile) {
      return res.status(400).json({
        success: false,
        error: 'Both job data and candidateProfile are required'
      });
    }

    const jobEligibility = analyzeJobEligibility(job);
    const candidateMatch = evaluateCandidateEligibility(jobEligibility, candidateProfile);

    return res.status(200).json({
      success: true,
      jobEligibility,
      candidateProfile,
      candidateMatch
    });
  } catch (error) {
    console.error('[jobController:evaluateDirectMatch] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to evaluate candidate eligibility',
      message: error.message
    });
  }
}

/**
 * POST /api/jobs/:id/tailor-cv
 * Tailors candidate CV for a specific job:
 * - Accepts either uploaded PDF CV or existing candidate profile JSON
 * - Infuses job-specific keywords, optimizes professional summary, enhances experience bullets
 * - Returns structured tailored resume document with match boost stats
 */
async function tailorCvForJob(req, res) {
  try {
    const { id } = req.params;
    let candidateProfile = null;
    let rawCvText = '';

    // 1. Fetch authenticated user data if available
    let authUser = null;
    if (req.user && req.user.id) {
      try {
        const User = require('../models/User');
        authUser = await User.findById(req.user.id).lean();
      } catch (_) {}
    }

    // 2. Base candidateProfile from body or user record
    if (req.body && req.body.candidateProfile) {
      candidateProfile = typeof req.body.candidateProfile === 'string'
        ? JSON.parse(req.body.candidateProfile)
        : req.body.candidateProfile;
    } else if (authUser && authUser.candidateProfile) {
      candidateProfile = { ...authUser.candidateProfile };
    }

    // 3. Process CV file or Portfolio URL
    if (req.file) {
      rawCvText = await parseCvPdf(req.file.buffer);
      const parsed = extractCandidateProfile(rawCvText, {
        sourceType: 'pdf',
        sourceName: req.file.originalname || 'Uploaded CV',
        name: authUser?.name || candidateProfile?.name
      });
      candidateProfile = { ...(candidateProfile || {}), ...parsed };
    } else if (req.body && req.body.portfolioUrl && req.body.portfolioUrl.trim()) {
      const pUrl = req.body.portfolioUrl.trim();
      try {
        const fetchedText = await parsePortfolioUrl(pUrl);
        if (fetchedText && fetchedText.length > 50) {
          rawCvText = fetchedText;
          const parsed = extractCandidateProfile(fetchedText, {
            sourceType: 'url',
            sourceName: pUrl,
            name: authUser?.name || candidateProfile?.name
          });
          candidateProfile = { ...(candidateProfile || {}), ...parsed };
        }
      } catch (urlErr) {
        console.warn('[jobController:tailorCvForJob] Portfolio scraping warning:', urlErr.message);
        // If candidate already has a profile or user record, gracefully proceed instead of failing
        if (!candidateProfile && (!authUser || !authUser.candidateProfile)) {
          throw urlErr;
        }
      }
      if (candidateProfile) {
        candidateProfile.portfolio = pUrl;
      }
    } else if (req.body && req.body.rawCvText) {
      rawCvText = req.body.rawCvText;
    }

    if (!rawCvText && candidateProfile?.rawCvText) {
      rawCvText = candidateProfile.rawCvText;
    }

    // 4. Ensure candidateProfile has valid identity metadata
    if (candidateProfile) {
      if ((!candidateProfile.name || candidateProfile.name.toLowerCase() === 'candidate') && authUser?.name) {
        candidateProfile.name = authUser.name;
      }
      if (!candidateProfile.email && authUser?.email) {
        candidateProfile.email = authUser.email;
      }
    }

    // Sync candidateProfile back to user if authenticated
    if (req.user && req.user.id && candidateProfile) {
      try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user.id, { candidateProfile });
      } catch (_) {}
    }

    if (!candidateProfile && !rawCvText) {
      return res.status(400).json({
        success: false,
        error: 'Please enter your portfolio website URL or upload a PDF CV to tailor.'
      });
    }

    let job = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      job = await Job.findById(id).lean();
    }
    if (!job) {
      job = await Job.findOne({ sourceJobId: id }).lean();
    }
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobEligibility = analyzeJobEligibility(job);

    const result = tailorCandidateResume({
      candidateProfile,
      rawCvText,
      job,
      jobEligibility
    });

    return res.status(200).json({
      success: true,
      message: `CV successfully tailored for ${job.title} at ${job.company}`,
      tailoredResume: result.tailoredResume,
      stats: result.stats,
      parsedProfile: candidateProfile
    });
  } catch (error) {
    console.error('[jobController:tailorCvForJob] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to tailor CV for job',
      message: error.message
    });
  }
}

/**
 * POST /api/jobs/harvest?city={cityName}
 * Automatically discovers & harvests live jobs across public ATS boards for all employers in that city.
 */
async function harvestJobs(req, res) {
  try {
    const { harvestCityJobs, getHarvestStatus } = require('../services/autoJobHarvester');
    const { city } = req.query;

    if (!city || city === 'all') {
      return res.status(400).json({
        success: false,
        message: 'Please specify a valid city name (e.g. ?city=Hyderabad or ?city=Pune)'
      });
    }

    const currentStatus = getHarvestStatus();
    if (currentStatus.isRunning) {
      return res.status(200).json({
        success: true,
        message: `Auto-harvester is already active for "${currentStatus.activeCity}".`,
        status: currentStatus
      });
    }

    // Trigger asynchronously in the background
    harvestCityJobs(city)
      .then((summary) => console.log(`[AutoHarvest] Finished harvest run for ${city}:`, summary))
      .catch((err) => console.error(`[AutoHarvest] Failed harvest run for ${city}:`, err.message));

    return res.status(202).json({
      success: true,
      message: `Started automated public ATS harvest for ${city}. Live jobs will automatically populate MongoDB and map.`,
      city
    });
  } catch (error) {
    console.error('[jobController:harvestJobs] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger automated job harvest',
      message: error.message
    });
  }
}

/**
 * GET /api/jobs/harvest/status
 * Returns current automated harvest status
 */
function getHarvestState(req, res) {
  const { getHarvestStatus } = require('../services/autoJobHarvester');
  return res.status(200).json({
    success: true,
    status: getHarvestStatus()
  });
}

/**
 * POST /api/jobs/re-enrich
 * Re-runs corridorResolver on existing jobs so that newly added corridor aliases are applied
 */
async function reEnrichJobs(req, res) {
  try {
    const { resolveCorridor } = require('../utils/corridorResolver');
    const { slugify } = require('../utils/companyUtils');
    const Company = require('../models/Company');
    const Office = require('../models/Office');
    const City = require('../models/City');

    let reclassifiedCount = 0;
    let linkedCompaniesCount = 0;

    // 1. Reclassify misclassified jobs (e.g. Speechify or other jobs where locationRaw points to another city/country)
    const misclassifiedJobs = await Job.find({
      city: 'Noida',
      locationRaw: { $exists: true, $ne: '' }
    }).lean();

    const reclassOps = [];
    for (const job of misclassifiedJobs) {
      const loc = (job.locationRaw || '').toLowerCase();
      const hasNoida = loc.includes('noida') || loc.includes('greater noida');
      const reLoc = resolveCorridor(job.locationRaw);
      const isActualNoida = (reLoc.city && reLoc.city.toLowerCase() === 'noida') || hasNoida;

      if (!isActualNoida) {
        reclassOps.push({
          updateOne: {
            filter: { _id: job._id },
            update: {
              $set: {
                city: reLoc.city || 'Other',
                state: reLoc.state || null,
                country: reLoc.country || (reLoc.city ? 'India' : 'International'),
                techCorridor: reLoc.techCorridor || null
              }
            }
          }
        });
        reclassifiedCount++;
      }
    }

    if (reclassOps.length > 0) {
      await Job.bulkWrite(reclassOps, { ordered: false });
    }

    // 2. Link companyId and Directory for all Noida jobs where companyId is missing
    const noidaJobsWithoutCompId = await Job.find({
      city: 'Noida',
      companyId: null
    }).select('_id company').lean();

    if (noidaJobsWithoutCompId.length > 0) {
      const distinctNames = [...new Set(noidaJobsWithoutCompId.map(j => j.company).filter(Boolean))];
      const noidaCityDoc = await City.findOne({ slug: 'noida' });

      for (const compName of distinctNames) {
        const slug = slugify(compName);
        let compDoc = await Company.findOne({
          $or: [{ slug }, { name: new RegExp(`^${compName}$`, 'i') }]
        });

        if (!compDoc) {
          compDoc = await Company.create({
            name: compName,
            slug,
            city: 'Noida',
            isTech: true,
            isHiring: true,
            category: 'Tech / Startups'
          });
        } else {
          await Company.updateOne(
            { _id: compDoc._id },
            { $set: { isHiring: true, isTech: true } }
          );
        }

        if (noidaCityDoc && compDoc) {
          await Office.findOneAndUpdate(
            { companyId: compDoc._id, cityId: noidaCityDoc._id },
            {
              $set: {
                companyId: compDoc._id,
                cityId: noidaCityDoc._id,
                name: compName,
                address: `Noida, Uttar Pradesh, India`
              }
            },
            { upsert: true }
          );
        }

        const linkRes = await Job.updateMany(
          { company: compName, city: 'Noida' },
          { $set: { companyId: compDoc._id } }
        );
        linkedCompaniesCount += (linkRes.modifiedCount || 0);
      }
    }

    // 3. Normal corridor & office re-enrichment for jobs with missing techCorridor or officeName
    const query = {};
    if (req.query.city) {
      query.city = new RegExp(`^${req.query.city}$`, 'i');
    }
    if (req.query.company) {
      query.company = new RegExp(`^${req.query.company}$`, 'i');
    }
    query.$or = [{ officeName: null }, { techCorridor: null }, { 'coordinates.lat': 12.9716 }];

    const limit = parseInt(req.query.limit, 10) || 5000;
    const jobs = await Job.find(query).limit(limit).lean();
    let updated = 0;
    const bulkOps = [];

    for (const job of jobs) {
      const locData = resolveCorridor(job.locationRaw || job.location, {
        localityHint: job.locality,
        officeAddress: job.officeAddress,
        companyName: job.company,
        title: job.title
      });
      if (locData.techCorridor || locData.officeName || locData.coordinates) {
        bulkOps.push({
          updateOne: {
            filter: { _id: job._id },
            update: {
              $set: {
                techCorridor: locData.techCorridor || job.techCorridor,
                locality: locData.locality || job.locality,
                officeName: locData.officeName || job.officeName,
                officeAddress: locData.officeAddress || job.officeAddress,
                coordinates: locData.coordinates || job.coordinates
              }
            }
          }
        });
        updated++;
      }
    }

    if (bulkOps.length > 0) {
      await Job.bulkWrite(bulkOps, { ordered: false });
    }

    // Fix Workday deep-link URLs missing /en-US/{site}
    const fixMastercard = await Job.updateMany(
      { applyUrl: { $regex: '^https://mastercard\\.wd1\\.myworkdayjobs\\.com/job/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'mastercard.wd1.myworkdayjobs.com/job/',
                replacement: 'mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers/job/'
              }
            }
          }
        }
      ]
    );

    const fixSalesforce = await Job.updateMany(
      { applyUrl: { $regex: 'salesforce\\.wd1\\.myworkdayjobs\\.com' } },
      { $set: { applyUrl: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site' } }
    );

    return res.status(200).json({
      success: true,
      reclassifiedCount,
      linkedCompaniesCount,
      corridorUpdated: updated,
      totalProcessed: jobs.length,
      workdayFixed: (fixMastercard.modifiedCount || 0) + (fixSalesforce.modifiedCount || 0)
    });
  } catch (err) {
    console.error('[jobController:reEnrichJobs] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/jobs/audit-urls
 * Inspects all job applyUrl domains and patterns across the database
 */
async function auditUrls(req, res) {
  try {
    const totalJobs = await Job.countDocuments();
    
    // Group by source
    const bySource = await Job.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);

    // Check invalid / non-http URLs
    const invalidSchemeCount = await Job.countDocuments({
      $or: [
        { applyUrl: { $exists: false } },
        { applyUrl: null },
        { applyUrl: '' },
        { applyUrl: { $not: /^https?:\/\//i } }
      ]
    });
    const invalidSchemeSamples = await Job.find({
      $or: [
        { applyUrl: { $exists: false } },
        { applyUrl: null },
        { applyUrl: '' },
        { applyUrl: { $not: /^https?:\/\//i } }
      ]
    }).select('company title source applyUrl').limit(10).lean();

    // Search engines (google, bing, yahoo search)
    const searchEngineJobs = await Job.countDocuments({
      applyUrl: { $regex: 'google\\.com/search|bing\\.com/search|duckduckgo\\.com', $options: 'i' }
    });

    // Check myworkdayjobs without /en-US/
    const brokenWorkday = await Job.countDocuments({
      applyUrl: { $regex: 'myworkdayjobs\\.com/job/' }
    });
    const brokenWorkdayComps = await Job.distinct('company', {
      applyUrl: { $regex: 'myworkdayjobs\\.com/job/' }
    });

    // Check SmartRecruiters with %20 or spaces in company name path
    const brokenSmartRecruiters = await Job.countDocuments({
      applyUrl: { $regex: 'jobs\\.smartrecruiters\\.com/[^/]*(%20|\\s)' }
    });
    const brokenSmartRecruitersComps = await Job.distinct('company', {
      applyUrl: { $regex: 'jobs\\.smartrecruiters\\.com/[^/]*(%20|\\s)' }
    });

    // Check guessed fake domains: careers.<name>.com (where path is empty or just /)
    const fakeCareersCount = await Job.countDocuments({
      applyUrl: { $regex: '^https?://careers\\.[a-z0-9-]+\\.com/?$' }
    });
    const fakeCareersComps = await Job.distinct('company', {
      applyUrl: { $regex: '^https?://careers\\.[a-z0-9-]+\\.com/?$' }
    });

    // Distinct hostnames / domain patterns
    const sampleJobs = await Job.find({}).select('source company applyUrl title').lean();
    const domainCounts = {};
    const samplesBySource = {};

    for (const j of sampleJobs) {
      const src = j.source || 'unknown';
      if (!samplesBySource[src]) samplesBySource[src] = [];
      if (samplesBySource[src].length < 4) {
        samplesBySource[src].push({
          company: j.company,
          title: j.title,
          applyUrl: j.applyUrl
        });
      }

      if (j.applyUrl) {
        try {
          const u = new URL(j.applyUrl);
          const host = u.hostname;
          domainCounts[host] = (domainCounts[host] || 0) + 1;
        } catch {
          domainCounts['__INVALID_URL__'] = (domainCounts['__INVALID_URL__'] || 0) + 1;
        }
      } else {
        domainCounts['__EMPTY__'] = (domainCounts['__EMPTY__'] || 0) + 1;
      }
    }

    // Sort top domains
    const sortedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 35)
      .map(([domain, count]) => ({ domain, count }));

    return res.status(200).json({
      success: true,
      totalJobs,
      bySource,
      invalidSchemeCount,
      invalidSchemeSamples,
      searchEngineJobs,
      brokenWorkday,
      brokenWorkdayComps,
      brokenSmartRecruiters,
      brokenSmartRecruitersComps,
      fakeCareersCount,
      fakeCareersComps,
      topDomains: sortedDomains,
      samplesBySource
    });
  } catch (err) {
    console.error('[jobController:auditUrls] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/jobs/fix-urls
 * Reconstructs accurate direct URLs for jobs with broken/guessed apply URLs
 */
async function fixBrokenUrls(req, res) {
  try {
    const Company = require('../models/Company');
    const portals = require('../config/companyCareerPortals.json');
    const companySeeds = require('../config/companies.json');

    // Build company lookup maps
    const allCompanies = await Company.find({}).lean();
    const companyMap = new Map();
    for (const c of allCompanies) {
      if (c.name) companyMap.set(c.name.toLowerCase().trim(), c);
      if (c.slug) companyMap.set(c.slug.toLowerCase().trim(), c);
    }

    const seedMap = new Map();
    for (const s of companySeeds) {
      if (s.name) seedMap.set(s.name.toLowerCase().trim(), s);
      if (s.slug) seedMap.set(s.slug.toLowerCase().trim(), s);
    }

    const portalMap = new Map();
    for (const [name, url] of Object.entries(portals)) {
      portalMap.set(name.toLowerCase().trim(), url);
    }

    // 1. Fix broken Workday URLs missing /en-US/{site}
    const fixMastercard = await Job.updateMany(
      { applyUrl: { $regex: 'mastercard\\.wd1\\.myworkdayjobs\\.com/job/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'mastercard.wd1.myworkdayjobs.com/job/',
                replacement: 'mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers/job/'
              }
            }
          }
        }
      ]
    );

    const fixVisa = await Job.updateMany(
      { applyUrl: { $regex: 'visa\\.wd5\\.myworkdayjobs\\.com/job/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'visa.wd5.myworkdayjobs.com/job/',
                replacement: 'visa.wd5.myworkdayjobs.com/en-US/Visa/job/'
              }
            }
          }
        }
      ]
    );

    const fixSalesforce = await Job.updateMany(
      { applyUrl: { $regex: 'salesforce\\.wd12?\\.myworkdayjobs\\.com/job/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'myworkdayjobs.com/job/',
                replacement: 'myworkdayjobs.com/en-US/External_Career_Site/job/'
              }
            }
          }
        }
      ]
    );

    const fixAdobe = await Job.updateMany(
      { applyUrl: { $regex: 'adobe\\.wd5\\.myworkdayjobs\\.com/job/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'adobe.wd5.myworkdayjobs.com/job/',
                replacement: 'adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/'
              }
            }
          }
        }
      ]
    );

    const fixEurofins = await Job.updateMany(
      { company: 'Eurofins' },
      { $set: { applyUrl: 'https://www.eurofins.com/careers/' } }
    );

    // Fix SmartRecruiters URLs with space or %20 (like ServiceNow India, Brainwonders Delhi, Harbinger Group)
    await Job.updateMany(
      { applyUrl: { $regex: 'jobs\\.smartrecruiters\\.com/ServiceNow(%20|\\s)India/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'jobs.smartrecruiters.com/ServiceNow%20India/',
                replacement: 'jobs.smartrecruiters.com/ServiceNow/'
              }
            }
          }
        }
      ]
    );

    await Job.updateMany(
      { applyUrl: { $regex: 'jobs\\.smartrecruiters\\.com/Brainwonders(%20|\\s)Delhi/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'jobs.smartrecruiters.com/Brainwonders%20Delhi/',
                replacement: 'jobs.smartrecruiters.com/Brainwonders/'
              }
            }
          }
        }
      ]
    );

    await Job.updateMany(
      { applyUrl: { $regex: 'jobs\\.smartrecruiters\\.com/Harbinger(%20|\\s)Group/' } },
      [
        {
          $set: {
            applyUrl: {
              $replaceOne: {
                input: '$applyUrl',
                find: 'jobs.smartrecruiters.com/Harbinger%20Group/',
                replacement: 'jobs.smartrecruiters.com/HarbingerGroup/'
              }
            }
          }
        }
      ]
    );

    // Fix Vatika Tech Hub and invalid schemes (e.g. 'https:/')
    await Job.updateMany(
      { company: 'Vatika Tech Hub' },
      { $set: { applyUrl: 'https://careers.vatikagroup.com' } }
    );
    await Company.updateOne(
      { slug: 'vatika-tech-hub' },
      { $set: { website: 'https://careers.vatikagroup.com', careerPage: 'https://careers.vatikagroup.com' } }
    );

    await Job.updateMany(
      {
        $or: [
          { applyUrl: { $exists: false } },
          { applyUrl: null },
          { applyUrl: '' },
          { applyUrl: 'https:/' },
          { applyUrl: { $not: /^https?:\/\//i } }
        ]
      },
      { $set: { applyUrl: 'https://www.linkedin.com/jobs/' } }
    );

    // 2. Find jobs with fake guessed careers.<name>.com URLs
    const fakeJobs = await Job.find({
      applyUrl: { $regex: 'careers\\.[a-z0-9]+\\.com' }
    }).select('_id company source sourceJobId applyUrl').lean();

    let repairedFakes = 0;
    const bulkOps = [];

    for (const j of fakeJobs) {
      const compName = (j.company || '').trim();
      const compLower = compName.toLowerCase();
      let realUrl = null;

      // Check verified portals map
      if (portalMap.has(compLower)) {
        realUrl = portalMap.get(compLower);
      } else {
        for (const [key, pUrl] of portalMap.entries()) {
          if (compLower.includes(key) || key.includes(compLower)) {
            realUrl = pUrl;
            break;
          }
        }
      }

      // Check seeds config
      if (!realUrl && seedMap.has(compLower)) {
        const seed = seedMap.get(compLower);
        if (seed.ats === 'greenhouse' && seed.slug) {
          realUrl = `https://boards.greenhouse.io/${seed.slug}/jobs/${j.sourceJobId || ''}`.replace(/\/+$/, '');
        } else if (seed.ats === 'lever' && seed.slug) {
          realUrl = `https://jobs.lever.co/${seed.slug}/${j.sourceJobId || ''}`.replace(/\/+$/, '');
        } else if (seed.ats === 'ashby' && seed.slug) {
          realUrl = `https://jobs.ashbyhq.com/${seed.slug}/${j.sourceJobId || ''}`.replace(/\/+$/, '');
        } else if (seed.ats === 'smartrecruiters' && seed.slug) {
          realUrl = `https://jobs.smartrecruiters.com/${seed.slug}/${j.sourceJobId || ''}`.replace(/\/+$/, '');
        }
      }

      // Check Company model
      if (!realUrl && companyMap.has(compLower)) {
        const comp = companyMap.get(compLower);
        if (comp.careersUrl) {
          realUrl = comp.careersUrl;
        } else if (comp.website) {
          realUrl = comp.website;
        }
      }

      // If sourceJobId is a valid ATS format (e.g. greenhouse_{slug}_{id} or smartrecruiters)
      if (!realUrl && j.sourceJobId) {
        if (j.source === 'greenhouse' && j.sourceJobId.includes('_')) {
          const parts = j.sourceJobId.split('_');
          const slug = parts[1];
          const id = parts[2];
          if (slug && id) realUrl = `https://boards.greenhouse.io/${slug}/jobs/${id}`;
        } else if (j.source === 'smartrecruiters' && j.sourceJobId.includes('_')) {
          const parts = j.sourceJobId.split('_');
          const id = parts[parts.length - 1];
          const cleanSlug = compName.replace(/\s+(india|pvt|ltd|limited|group|delhi)/gi, '').replace(/\s+/g, '');
          realUrl = `https://jobs.smartrecruiters.com/${cleanSlug}/${id}`;
        }
      }

      // If still not resolved, point to official search on LinkedIn or Google Careers rather than a dead DNS domain
      if (!realUrl) {
        const query = encodeURIComponent(`${compName} careers openings`);
        realUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(compName)}`;
      }

      if (realUrl && realUrl !== j.applyUrl) {
        bulkOps.push({
          updateOne: {
            filter: { _id: j._id },
            update: { $set: { applyUrl: realUrl } }
          }
        });
        repairedFakes++;
      }
    }

    if (bulkOps.length > 0) {
      await Job.bulkWrite(bulkOps, { ordered: false });
    }

    return res.status(200).json({
      success: true,
      fakeJobsFound: fakeJobs.length,
      repairedFakes,
      workdayFixed: (fixMastercard.modifiedCount || 0) + (fixSalesforce.modifiedCount || 0)
    });
  } catch (err) {
    console.error('[jobController:fixBrokenUrls] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getJobs,
  getCities,
  getCorridors,
  getCountries,
  getJobStats,
  triggerSync,
  getSyncStatus,
  getJobEligibility,
  parseCandidateCv,
  parseCandidateUrl,
  checkCandidateEligibility,
  evaluateDirectMatch,
  tailorCvForJob,
  harvestJobs,
  getHarvestState,
  reEnrichJobs,
  auditUrls,
  fixBrokenUrls
};

