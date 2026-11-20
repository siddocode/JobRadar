const Company = require('../models/Company');
const Office = require('../models/Office');
const City = require('../models/City');
const Job = require('../models/Job');
const UncertainMerge = require('../models/UncertainMerge');
const UserPipeline = require('../models/UserPipeline');
const { calculateDistanceKm } = require('../utils/geoUtils');
const { detectLocalityFromCoords } = require('../utils/companyUtils');

/**
 * GET /api/directory/cities
 * Returns active cities with office/company counts
 */
exports.getCities = async (req, res) => {
  try {
    const cities = await City.find({ active: true }).sort({ name: 1 });

    const counts = await Office.aggregate([
      {
        $group: {
          _id: '$cityId',
          officeCount: { $sum: 1 },
          companies: { $addToSet: '$companyId' }
        }
      }
    ]);

    const countMap = {};
    for (const c of counts) {
      countMap[c._id.toString()] = {
        officeCount: c.officeCount,
        companyCount: c.companies ? c.companies.length : 0
      };
    }

    const result = cities.map(city => ({
      _id: city._id,
      slug: city.slug,
      name: city.name,
      state: city.state,
      bbox: city.bbox,
      officeCount: countMap[city._id.toString()]?.officeCount || 0,
      companyCount: countMap[city._id.toString()]?.companyCount || 0
    }));

    res.status(200).json({ success: true, cities: result });
  } catch (err) {
    console.error('Error fetching directory cities:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch cities' });
  }
};

/**
 * GET /api/directory/stats
 * High-speed aggregate metrics for top cards
 */
exports.getDirectoryStats = async (req, res) => {
  try {
    const [total, officesCount, hiringCompIds] = await Promise.all([
      Company.countDocuments(),
      Office.countDocuments(),
      Job.distinct('companyId', { status: 'open', companyId: { $ne: null } })
    ]);

    res.status(200).json({
      success: true,
      stats: {
        total,
        hiring: hiringCompIds.length,
        offices: officesCount
      }
    });
  } catch (err) {
    console.error('Error fetching directory stats:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch directory stats' });
  }
};

/**
 * GET /api/directory/companies
 * Query params: city, hiring ('hiring' | 'no_vacancy' | 'all'), q, techOnly, followUp, page, limit
 */
exports.getCompanies = async (req, res) => {
  try {
    const {
      city,
      hiring = 'all',
      q = '',
      techOnly = 'false',
      followUp = 'all',
      userLat,
      userLng,
      sortBy,
      maxDistanceKm,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    // Base company query
    const companyQuery = {};

    if (techOnly === 'true') {
      companyQuery.isTech = true;
    }

    if (followUp && followUp !== 'all') {
      if (req.user && req.user.id) {
        const userPipes = await UserPipeline.find({ userId: req.user.id, followUpStatus: followUp }, 'companyId').lean();
        const pipeCompanyIds = userPipes.map(p => p.companyId);
        if (companyQuery._id && companyQuery._id.$in) {
          const idSet = new Set(pipeCompanyIds.map(id => id.toString()));
          companyQuery._id = { $in: companyQuery._id.$in.filter(id => idSet.has(id.toString())) };
        } else {
          companyQuery._id = { $in: pipeCompanyIds };
        }
      } else {
        return res.status(200).json({
          success: true,
          companies: [],
          total: 0,
          page: pageNum,
          totalPages: 0
        });
      }
    }

    // City filter
    let cityRecord = null;
    if (city && city !== 'all') {
      cityRecord = await City.findOne({ slug: city.toLowerCase() });
      if (cityRecord) {
        const officesInCity = await Office.find({ cityId: cityRecord._id }, 'companyId');
        const companyIdsInCity = officesInCity.map(o => o.companyId);
        if (companyQuery._id && companyQuery._id.$in) {
          const idSet = new Set(companyIdsInCity.map(id => id.toString()));
          companyQuery._id = { $in: companyQuery._id.$in.filter(id => idSet.has(id.toString())) };
        } else {
          companyQuery._id = { $in: companyIdsInCity };
        }
      } else {
        return res.status(200).json({
          success: true,
          companies: [],
          total: 0,
          page: pageNum,
          totalPages: 0
        });
      }
    }

    // Search keyword query
    if (q && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');

      // Also search office addresses/localities
      const matchingOffices = await Office.find({
        $or: [{ address: searchRegex }, { locality: searchRegex }]
      }, 'companyId');
      const officeCompIds = matchingOffices.map(o => o.companyId);

      companyQuery.$or = [
        { name: searchRegex },
        { category: searchRegex },
        { notes: searchRegex },
        { _id: { $in: officeCompIds } }
      ];
    }

    // Filter by hiring status before querying companies
    if (hiring === 'hiring' || hiring === 'no_vacancy') {
      const hiringCompIds = await Job.distinct('companyId', { status: 'open', companyId: { $ne: null } });
      if (hiring === 'hiring') {
        if (companyQuery._id && companyQuery._id.$in) {
          const idSet = new Set(hiringCompIds.map(id => id.toString()));
          companyQuery._id = { $in: companyQuery._id.$in.filter(id => idSet.has(id.toString())) };
        } else {
          companyQuery._id = { $in: hiringCompIds };
        }
      } else if (hiring === 'no_vacancy') {
        if (companyQuery._id && companyQuery._id.$in) {
          const idSet = new Set(hiringCompIds.map(id => id.toString()));
          companyQuery._id = { $in: companyQuery._id.$in.filter(id => !idSet.has(id.toString())) };
        } else {
          companyQuery._id = { $nin: hiringCompIds };
        }
      }
    }

    // Check if user location is provided
    const numUserLat = userLat != null && userLat !== '' ? parseFloat(userLat) : null;
    const numUserLng = userLng != null && userLng !== '' ? parseFloat(userLng) : null;
    const validLat = numUserLat != null && numUserLat >= -90 && numUserLat <= 90;
    const validLng = numUserLng != null && numUserLng >= -180 && numUserLng <= 180;
    const hasUserLocation = validLat && validLng;
    const maxDist = maxDistanceKm != null && maxDistanceKm !== '' && !isNaN(parseFloat(maxDistanceKm))
      ? parseFloat(maxDistanceKm)
      : null;
    const useProximity = hasUserLocation && (sortBy === 'distance' || maxDist != null);
    const isSortByDistance = hasUserLocation && sortBy === 'distance';

    const startIndex = (pageNum - 1) * limitNum;
    let total = 0;
    let paginatedCompanies = [];
    const companyDistMap = new Map();

    if (useProximity) {
      // 1. Fetch offices with coordinates to determine proximity across all companies
      const allOffices = await Office.find({ lat: { $ne: null }, lng: { $ne: null } })
        .select('companyId lat lng')
        .lean();

      for (const off of allOffices) {
        if (!off.companyId) continue;
        const cId = off.companyId.toString();
        const dist = calculateDistanceKm(numUserLat, numUserLng, off.lat, off.lng);
        if (dist != null) {
          const prev = companyDistMap.get(cId);
          if (prev == null || dist < prev) {
            companyDistMap.set(cId, dist);
          }
        }
      }

      // Filter by max distance if requested
      let sortedCompIds = Array.from(companyDistMap.entries())
        .filter(([cId, d]) => maxDist == null || d <= maxDist)
        .sort((a, b) => a[1] - b[1])
        .map(([cId]) => cId);

      // Intersect with companyQuery._id if already specified
      if (companyQuery._id && companyQuery._id.$in) {
        const idSet = new Set(companyQuery._id.$in.map(id => id.toString()));
        sortedCompIds = sortedCompIds.filter(id => idSet.has(id));
      } else if (companyQuery._id && companyQuery._id.$nin) {
        const idSet = new Set(companyQuery._id.$nin.map(id => id.toString()));
        sortedCompIds = sortedCompIds.filter(id => !idSet.has(id));
      }

      // Filter against any remaining companyQuery criteria (e.g. name, techOnly, etc.)
      const matchingCompRecords = await Company.find({
        ...companyQuery,
        _id: { $in: sortedCompIds }
      }, '_id').lean();
      const matchingSet = new Set(matchingCompRecords.map(c => c._id.toString()));
      sortedCompIds = sortedCompIds.filter(id => matchingSet.has(id));

      total = sortedCompIds.length;
      const paginatedIds = sortedCompIds.slice(startIndex, startIndex + limitNum);

      const foundCompanies = await Company.find({ _id: { $in: paginatedIds } }).lean();
      const compMap = new Map(foundCompanies.map(c => [c._id.toString(), c]));
      paginatedCompanies = paginatedIds.map(id => compMap.get(id)).filter(Boolean);
    } else {
      // Default query: alphabetical
      total = await Company.countDocuments(companyQuery);
      paginatedCompanies = await Company.find(companyQuery)
        .sort({ name: 1 })
        .skip(startIndex)
        .limit(limitNum)
        .lean();
    }

    // Attach open jobs and offices ONLY for the paginated slice
    const companyIds = paginatedCompanies.map(c => c._id);
    console.time('[Perf] attachOfficesAndJobs');
    const [allOffices, allOpenJobs] = await Promise.all([
      Office.find({ companyId: { $in: companyIds } }).populate('cityId', 'name slug state').lean(),
      Job.find({ companyId: { $in: companyIds }, status: 'open' })
        .select('title city state country workMode applyUrl companyId')
        .lean()
    ]);
    console.timeEnd('[Perf] attachOfficesAndJobs');


    // Group offices and jobs by companyId
    const officesMap = {};
    for (const off of allOffices) {
      const cId = off.companyId.toString();
      if (!officesMap[cId]) officesMap[cId] = [];
      officesMap[cId].push(off);
    }

    const jobsMap = {};
    for (const j of allOpenJobs) {
      const cId = j.companyId.toString();
      if (!jobsMap[cId]) jobsMap[cId] = [];
      jobsMap[cId].push(j);
    }

    // Check if user is logged in to overlay their personal outreach status
    let userPipelineMap = {};
    if (req.user && req.user.id) {
      const userPipelines = await UserPipeline.find({
        userId: req.user.id,
        companyId: { $in: paginatedCompanies.map(c => c._id) }
      }).lean();
      for (const up of userPipelines) {
        userPipelineMap[up.companyId.toString()] = up;
      }
    }

    // Assemble company cards with strictly verified hiring status & distance
    let processed = paginatedCompanies.map(comp => {
      const cId = comp._id.toString();
      const openJobs = jobsMap[cId] || [];
      const offices = officesMap[cId] || [];
      const isHiring = openJobs.length > 0;
      const userPipe = userPipelineMap[cId];

      let distanceKm = null;
      let nearestOffice = null;

      if (hasUserLocation) {
        let minDistance = Infinity;

        // Check each office coordinates
        for (const off of offices) {
          if (off.lat != null && off.lng != null) {
            const d = calculateDistanceKm(numUserLat, numUserLng, off.lat, off.lng);
            if (d != null && d < minDistance) {
              minDistance = d;
              nearestOffice = off;
            }
          }
        }

        // Also check company base coordinates
        if (comp.latitude != null && comp.longitude != null) {
          const d = calculateDistanceKm(numUserLat, numUserLng, comp.latitude, comp.longitude);
          if (d != null && d < minDistance) {
            minDistance = d;
            if (!nearestOffice) {
              nearestOffice = { address: comp.address, locality: comp.locality, lat: comp.latitude, lng: comp.longitude };
            }
          }
        }

        if (minDistance !== Infinity) {
          distanceKm = minDistance;
        }
      }

      return {
        ...comp,
        followUpStatus: userPipe ? userPipe.followUpStatus : 'none',
        notes: userPipe ? userPipe.notes : '',
        offices,
        openJobs,
        openJobsCount: openJobs.length,
        isHiring,
        hiringStatusLabel: isHiring
          ? `Hiring (${openJobs.length} opening${openJobs.length > 1 ? 's' : ''})`
          : 'No known vacancy',
        distanceKm,
        nearestOffice
      };
    });

    // Proximity sorting & filtering
    if (hasUserLocation && maxDist != null && maxDist > 0) {
      // Only companies with a known, in-radius distance may pass. Keeping
      // nulls here used to leak unrelated companies into nearby results.
      processed = processed.filter(c => c.distanceKm != null && c.distanceKm <= maxDist);
    }

    if (hasUserLocation && sortBy === 'distance') {
      processed.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    res.status(200).json({
      success: true,
      companies: processed,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      userLocationApplied: hasUserLocation
    });
  } catch (err) {
    console.error('Error fetching directory companies:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch companies' });
  }
};


/**
 * GET /api/directory/reach-out
 * Lists companies tracked in the user's personal outreach pipeline
 */
exports.getReachOutCompanies = async (req, res) => {
  try {
    const { city, q, status } = req.query;

    const validPipelineStages = ['to_contact', 'contacted', 'replied', 'not_interested'];
    const stageCounts = {
      all: 0,
      to_contact: 0,
      contacted: 0,
      replied: 0,
      not_interested: 0
    };

    // If guest (not authenticated), return empty list with authenticated: false
    if (!req.user || !req.user.id) {
      return res.status(200).json({
        success: true,
        authenticated: false,
        companies: [],
        total: 0,
        stageCounts
      });
    }

    // Authenticated user: retrieve all companies tracked in their pipeline
    const userPipelines = await UserPipeline.find({
      userId: req.user.id,
      followUpStatus: { $in: validPipelineStages }
    }).lean();

    const userPipelineMap = {};
    for (const up of userPipelines) {
      const cId = up.companyId.toString();
      userPipelineMap[cId] = up;
      if (stageCounts.hasOwnProperty(up.followUpStatus)) {
        stageCounts[up.followUpStatus] += 1;
        stageCounts.all += 1;
      }
    }

    // Filter by stage if requested (otherwise show all tracked companies)
    const filteredPipelines = userPipelines.filter(up =>
      !status || status === 'all' || up.followUpStatus === status
    );

    const targetCompanyIds = filteredPipelines.map(up => up.companyId);

    if (targetCompanyIds.length === 0) {
      return res.status(200).json({
        success: true,
        authenticated: true,
        companies: [],
        total: 0,
        stageCounts
      });
    }

    const companyQuery = { _id: { $in: targetCompanyIds } };

    if (city && city !== 'all') {
      const cityRecord = await City.findOne({ slug: city.toLowerCase() });
      if (cityRecord) {
        const officesInCity = await Office.find({ cityId: cityRecord._id, companyId: { $in: targetCompanyIds } }, 'companyId');
        companyQuery._id = { $in: officesInCity.map(o => o.companyId) };
      } else {
        const matchingOffices = await Office.find({
          companyId: { $in: targetCompanyIds },
          $or: [
            { locality: new RegExp(`^${city}$`, 'i') },
            { address: new RegExp(city, 'i') }
          ]
        }, 'companyId');
        companyQuery._id = { $in: matchingOffices.map(o => o.companyId) };
      }
    }

    if (q && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      companyQuery.name = new RegExp(escaped, 'i');
    }

    const companies = await Company.find(companyQuery)
      .sort({ updatedAt: -1, name: 1 })
      .lean();

    const companyIds = companies.map(c => c._id);

    // Attach offices and check jobs
    const [allOffices, allOpenJobs] = await Promise.all([
      Office.find({ companyId: { $in: companyIds } }).populate('cityId', 'name slug state').lean(),
      Job.find({ companyId: { $in: companyIds }, status: 'open' }).select('companyId').lean()
    ]);

    const hiringCompanyIds = new Set(allOpenJobs.map(j => j.companyId.toString()));

    const officesMap = {};
    for (const off of allOffices) {
      const cId = off.companyId.toString();
      if (!officesMap[cId]) officesMap[cId] = [];
      officesMap[cId].push(off);
    }

    let result = [];
    for (const comp of companies) {
      const cId = comp._id.toString();
      const isHiring = hiringCompanyIds.has(cId);
      const offices = officesMap[cId] || [];
      const userPipe = userPipelineMap[cId];

      const currentStatus = userPipe ? userPipe.followUpStatus : 'to_contact';
      const currentNotes = userPipe ? userPipe.notes : '';

      // Ensure direct contact channels
      const emails = [...(comp.contact?.emails || [])];
      const phones = [...(comp.contact?.phones || [])];

      if (emails.length === 0 && (comp.domain || comp.website || comp.slug)) {
        let domain = comp.domain;
        if (!domain && comp.website) {
          try {
            const parsed = new URL(comp.website.startsWith('http') ? comp.website : `https://${comp.website}`);
            domain = parsed.hostname.replace('www.', '');
          } catch {
            domain = `${comp.slug}.com`;
          }
        }
        if (!domain) domain = `${comp.slug}.com`;

        emails.push({
          value: `careers@${domain}`,
          sourceUrl: comp.website || comp.careersUrl || `https://${domain}`
        });
      }

      result.push({
        ...comp,
        followUpStatus: currentStatus,
        notes: currentNotes,
        contact: {
          ...comp.contact,
          emails,
          phones
        },
        offices,
        isHiring,
        hiringStatusLabel: isHiring ? 'Hiring (Open roles available)' : 'No known vacancy'
      });
    }

    res.status(200).json({
      success: true,
      authenticated: true,
      companies: result,
      total: result.length,
      stageCounts
    });
  } catch (err) {
    console.error('Error fetching reach out companies:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reach out list' });
  }
};

/**
 * PATCH /api/directory/companies/:id/follow-up
 * Updates followUpStatus and notes for the user's pipeline
 */
exports.updateCompanyFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const { followUpStatus, notes } = req.body;

    const validStatuses = ['to_contact', 'contacted', 'replied', 'not_interested', 'none'];
    const update = {};

    if (followUpStatus !== undefined) {
      if (!validStatuses.includes(followUpStatus)) {
        return res.status(400).json({ success: false, error: 'Invalid followUpStatus' });
      }
      update.followUpStatus = followUpStatus;
    }

    if (notes !== undefined) {
      update.notes = String(notes);
    }

    // Persist per-user pipeline record
    if (req.user && req.user.id) {
      // If user provided notes without specifying a follow-up status, promote to 'to_contact' if currently 'none'
      if (update.followUpStatus === undefined) {
        const existingPipe = await UserPipeline.findOne({ userId: req.user.id, companyId: id });
        if (!existingPipe || existingPipe.followUpStatus === 'none') {
          update.followUpStatus = 'to_contact';
        }
      }

      await UserPipeline.findOneAndUpdate(
        { userId: req.user.id, companyId: id },
        { $set: update },
        { upsert: true, new: true }
      );
    }

    const company = await Company.findById(id).lean();
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company not found' });
    }

    res.status(200).json({
      success: true,
      company: {
        ...company,
        followUpStatus: update.followUpStatus !== undefined ? update.followUpStatus : 'none',
        notes: update.notes !== undefined ? update.notes : ''
      },
      followUpStatus: update.followUpStatus !== undefined ? update.followUpStatus : 'none',
      notes: update.notes !== undefined ? update.notes : ''
    });
  } catch (err) {
    console.error('Error updating company follow-up:', err);
    res.status(500).json({ success: false, error: 'Failed to update company' });
  }
};

/**
 * GET /api/directory/uncertain-merges
 * Lists ambiguous merges needing human review
 */
exports.getUncertainMerges = async (req, res) => {
  try {
    const merges = await UncertainMerge.find({ status: 'pending' })
      .populate('companyA')
      .populate('companyB')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, merges });
  } catch (err) {
    console.error('Error fetching uncertain merges:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch uncertain merges' });
  }
};

/**
 * POST /api/directory/uncertain-merges/:id/resolve
 * Resolves an uncertain merge candidate (merge or dismiss)
 */
exports.resolveUncertainMerge = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'merge' | 'dismiss'

    const record = await UncertainMerge.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Uncertain merge record not found' });
    }

    if (action === 'dismiss') {
      record.status = 'dismissed';
      await record.save();
      return res.status(200).json({ success: true, message: 'Dismissed candidate' });
    }

    if (action === 'merge') {
      // Transfer offices and sources from B to A
      await Office.updateMany({ companyId: record.companyB }, { $set: { companyId: record.companyA } });
      await Job.updateMany({ companyId: record.companyB }, { $set: { companyId: record.companyA } });

      const compB = await Company.findById(record.companyB);
      if (compB) {
        const compA = await Company.findById(record.companyA);
        if (compA) {
          for (const s of compB.sources) {
            if (!compA.sources.includes(s)) compA.sources.push(s);
          }
          await compA.save();
        }
        await Company.findByIdAndDelete(record.companyB);
      }

      record.status = 'merged';
      await record.save();
      return res.status(200).json({ success: true, message: 'Companies merged successfully' });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) {
    console.error('Error resolving uncertain merge:', err);
    res.status(500).json({ success: false, error: 'Failed to resolve uncertain merge' });
  }
};

// Discovery state tracker
let discoveryState = {
  isRunning: false,
  citySlug: null,
  cityName: null,
  startedAt: null,
  finishedAt: null,
  lastSummary: null,
  error: null
};

/**
 * POST /api/directory/discover-city
 * Triggers an OpenStreetMap scan for startups & companies in a specific city.
 * Body: { citySlug: string, forceRefresh?: boolean }
 */
exports.discoverCity = async (req, res) => {
  try {
    const { citySlug, forceRefresh = false } = req.body;
    if (!citySlug || typeof citySlug !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid citySlug is required' });
    }

    const cleanSlug = citySlug.trim().toLowerCase();

    if (discoveryState.isRunning) {
      return res.status(409).json({
        success: false,
        message: `An OSM scan is already in progress for ${discoveryState.cityName || discoveryState.citySlug}.`,
        discoveryState
      });
    }

    let city = await City.findOne({ slug: cleanSlug });

    // If city is not yet seeded, check if it exists in INITIAL_CITIES from seedCities
    if (!city) {
      const { INITIAL_CITIES } = require('../scripts/seedCities');
      const preset = INITIAL_CITIES.find(c => c.slug === cleanSlug);
      if (preset) {
        city = await City.create(preset);
      } else {
        return res.status(404).json({
          success: false,
          error: `City "${cleanSlug}" is not configured. Please add its bounding box first.`
        });
      }
    }

    discoveryState.isRunning = true;
    discoveryState.citySlug = city.slug;
    discoveryState.cityName = city.name;
    discoveryState.startedAt = new Date();
    discoveryState.finishedAt = null;
    discoveryState.lastSummary = null;
    discoveryState.error = null;

    const { importOsmForCity } = require('../scripts/importOsm');

    // Run asynchronously so HTTP response is returned immediately
    importOsmForCity(city.slug, Boolean(forceRefresh))
      .then((summary) => {
        discoveryState.isRunning = false;
        discoveryState.finishedAt = new Date();
        discoveryState.lastSummary = summary;
        console.log(`[Discovery] OSM scan for ${city.name} completed successfully:`, summary);
      })
      .catch((err) => {
        discoveryState.isRunning = false;
        discoveryState.finishedAt = new Date();
        discoveryState.error = err.message || 'Error occurred during OSM scan';
        console.error(`[Discovery] OSM scan for ${city.name} failed:`, err);
      });

    return res.status(202).json({
      success: true,
      message: `OSM scan started for ${city.name} in background.`,
      discoveryState
    });
  } catch (err) {
    console.error('Error starting city discovery:', err);
    discoveryState.isRunning = false;
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/directory/scan-google-places
 * Triggers a Google Places map-wise scan for a target city
 */
exports.scanGooglePlaces = async (req, res) => {
  try {
    const { citySlug = 'kolkata', customApiKey, radius = 25000, keywords } = req.body;
    const { scanGooglePlacesCity, getScanState } = require('../services/googlePlacesService');

    const state = getScanState();
    if (state.isRunning) {
      return res.status(409).json({
        success: false,
        message: `A scan is already in progress for ${state.cityName || state.citySlug}.`,
        scanState: state
      });
    }

    // Launch scan asynchronously in background
    scanGooglePlacesCity({
      citySlug,
      customApiKey,
      radius: parseInt(radius, 10) || 25000,
      keywords
    }).catch(err => {
      console.error('[GooglePlaces Controller] Background scan error:', err);
    });

    return res.status(202).json({
      success: true,
      message: `Google Places map-wise scan initiated for ${citySlug}.`,
      scanState: getScanState()
    });
  } catch (err) {
    console.error('Error starting Google Places scan:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/directory/scan-google-places/status
 * Returns the current Google Places map-wise scan status and discovered preview
 */
exports.getGooglePlacesScanStatus = async (req, res) => {
  const { getScanState } = require('../services/googlePlacesService');
  return res.status(200).json({
    success: true,
    scanState: getScanState()
  });
};

/**
 * GET /api/directory/discover-city/status
 * Returns the current OSM discovery process status and latest results.
 */
exports.getDiscoveryStatus = async (req, res) => {
  return res.status(200).json({
    success: true,
    discoveryState
  });
};

/**
 * POST /api/directory/cities
 * Add a new city or enable an existing preset city
 */
exports.addCity = async (req, res) => {
  try {
    const { slug, name, state, bbox } = req.body;
    if (!slug || !name || !state || !Array.isArray(bbox) || bbox.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'name, state, slug, and bbox: [south, west, north, east] are required'
      });
    }

    const city = await City.findOneAndUpdate(
      { slug: slug.trim().toLowerCase() },
      {
        $set: {
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          state: state.trim(),
          bbox,
          active: true
        }
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({ success: true, city });
  } catch (err) {
    console.error('Error adding city:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/directory/companies
 * Add / import a company directly into the directory
 */
exports.createCompany = async (req, res) => {
  try {
    const { name, website, city: cityInput, address, category, notes, contact } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Company name is required' });
    }

    const { extractDomain, slugify } = require('../utils/companyUtils');
    const domain = extractDomain(website);
    let baseSlug = slugify(name) || 'company';
    let slug = baseSlug;
    let counter = 1;
    while (await Company.findOne({ slug })) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    // Check if company already exists by domain or slug
    let company = null;
    if (domain) {
      company = await Company.findOne({ domain });
    }
    if (!company) {
      company = await Company.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
    }

    if (!company) {
      const emailList = [];
      if (contact?.emails) {
        for (const em of contact.emails) {
          const val = typeof em === 'string' ? em : em.value;
          if (val) emailList.push({ value: val.trim(), sourceUrl: website || 'manual' });
        }
      }
      const phoneList = [];
      if (contact?.phones) {
        for (const ph of contact.phones) {
          const val = typeof ph === 'string' ? ph : ph.value;
          if (val) phoneList.push({ value: val.trim(), sourceUrl: website || 'manual' });
        }
      }

      company = await Company.create({
        name: name.trim(),
        slug,
        domain: domain || null,
        website: website ? website.trim() : null,
        category: category || 'Software & IT Services',
        isTech: true,
        followUpStatus: 'to_contact',
        notes: notes || '',
        contact: {
          emails: emailList,
          phones: phoneList,
          contactPageUrl: website ? `${website.replace(/\/+$/, '')}/contact` : null
        },
        sources: ['user_manual_add']
      });
    }

    // Attach office if city is specified
    let office = null;
    if (cityInput) {
      const cityClean = cityInput.trim().toLowerCase();
      let cityRecord = await City.findOne({ slug: cityClean }) || await City.findOne({ name: new RegExp(`^${cityInput}$`, 'i') });
      if (cityRecord) {
        office = await Office.findOne({ companyId: company._id, cityId: cityRecord._id });
        if (!office) {
          office = await Office.create({
            companyId: company._id,
            cityId: cityRecord._id,
            address: address || `${company.name}, ${cityRecord.name}`,
            locality: address ? address.split(',')[0].trim() : cityRecord.name,
            addressSource: 'user_manual_add',
            addressType: 'development',
            verified: true
          });
        }
      }
    }

    return res.status(201).json({ success: true, company, office });
  } catch (err) {
    console.error('Error creating company:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Pull the first matching long_name out of a Google `address_components` array.
 */
function pickAddressComponent(components, types) {
  if (!Array.isArray(components)) return '';
  for (const type of types) {
    const match = components.find((c) => Array.isArray(c?.types) && c.types.includes(type));
    if (match?.long_name) return match.long_name;
  }
  return '';
}

/**
 * Normalize a populated Office document into a place suggestion. `off.address`
 * can be missing in harvested records, so never assume it is a string.
 */
function buildOfficePlace(off) {
  const compName = off.companyId?.name || '';
  const cityName = off.cityId?.name || '';
  const address = typeof off.address === 'string' ? off.address : '';
  const locality = off.locality || '';
  const fallbackLocality = address ? address.split(',')[0].trim() : '';

  return {
    label: compName
      ? `${compName}${locality || cityName ? ` (${locality || cityName})` : ''}`
      : (locality || fallbackLocality || cityName),
    name: compName || locality || fallbackLocality,
    locality: locality || fallbackLocality,
    city: cityName,
    state: '',
    fullAddress: address || [locality, cityName].filter(Boolean).join(', '),
    lat: off.lat,
    lng: off.lng,
    category: 'office',
    // A recorded office is an exact address, not a generic city hint.
    specificity: 85,
    source: 'local_db'
  };
}

/**
 * GET /api/directory/places/search
 * Place & office search biased to user GPS coordinates
 * Query params: q, lat, lng, limit
 */
exports.searchPlaces = async (req, res) => {
  try {
    const { q = '', lat, lng, limit = 12 } = req.query;
    const query = q.trim().slice(0, 120);
    if (!query || query.length < 2) {
      return res.status(200).json({ success: true, places: [] });
    }

    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;
    const limitNum = Math.min(25, Math.max(1, parseInt(limit, 10) || 12));

    const results = [];
    const seenKeys = new Set();

    // 1. If GOOGLE_PLACES_API_KEY is configured in backend, query Google Places Autocomplete API
    const apiKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
    if (apiKey) {
      try {
        let googleUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}`;
        if (userLat != null && userLng != null) {
          googleUrl += `&location=${userLat},${userLng}&radius=50000`;
        }
        const gRes = await fetch(googleUrl);
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === 'OK' && Array.isArray(gData.predictions)) {
            for (const pred of gData.predictions.slice(0, 5)) {
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&fields=name,geometry,formatted_address,types,address_components&key=${apiKey}`;
              const dRes = await fetch(detailsUrl);
              if (dRes.ok) {
                const dData = await dRes.json();
                const place = dData.result;
                if (place?.geometry?.location) {
                  const pLat = place.geometry.location.lat;
                  const pLng = place.geometry.location.lng;
                  const key = `${pLat.toFixed(3)},${pLng.toFixed(3)}`;
                  if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    const types = place.types || [];
                    const isFood = types.some(t => ['restaurant', 'cafe', 'food', 'bar', 'meal_takeaway'].includes(t));
                    const isOffice = types.some(t => ['point_of_interest', 'establishment', 'office'].includes(t));
                    const components = place.address_components;
                    const locality = pickAddressComponent(components, [
                      'sublocality_level_1',
                      'sublocality',
                      'neighborhood'
                    ]);
                    const city = pickAddressComponent(components, ['locality', 'administrative_area_level_2']);
                    const state = pickAddressComponent(components, ['administrative_area_level_1']);
                    const name = place.name || pred.structured_formatting?.main_text || '';
                    // Google establishment results are building/POI level; keep
                    // their exact coordinates so the client never swaps them
                    // for a coarse centroid.
                    const isPrecise = types.some(t =>
                      ['establishment', 'point_of_interest', 'premise', 'street_address', 'subpremise'].includes(t)
                    );
                    results.push({
                      label: name || pred.description,
                      name,
                      locality,
                      city,
                      state,
                      fullAddress: place.formatted_address || pred.description,
                      lat: pLat,
                      lng: pLng,
                      category: isFood ? 'food' : (isOffice ? 'office' : 'landmark'),
                      specificity: isPrecise ? 95 : 55,
                      source: 'google_places'
                    });
                  }
                }
              }
            }
          }
        }
      } catch (gErr) {
        console.warn('[PlacesSearch] Google API error:', gErr.message);
      }
    }

    // 2. Search Curated Tech Hub Seeds & Company Office Registry (in-memory, 0ms)
    try {
      const { TECH_HUB_SEEDS } = require('../data/seeds/techHubSeeds');
      const officeRegistry = require('../config/companyOfficeRegistry.json');
      const corridorsConfig = require('../config/techHubCorridors.json');
      const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

      const matchesQuery = (text) => {
        const hay = String(text || '').toLowerCase();
        if (hay.includes(query.toLowerCase())) return true;
        return qTokens.length > 0 && qTokens.every(t => hay.includes(t));
      };

      // 2a. Tech corridors from techHubCorridors.json
      const citiesObj = corridorsConfig?.cities || {};
      for (const [cityName, cityData] of Object.entries(citiesObj)) {
        const stateName = cityData.state || '';
        for (const corr of Object.values(cityData.corridors || {})) {
          const hay = `${corr.name || ''} ${corr.shortName || ''} ${cityName} ${(corr.aliases || []).join(' ')}`;
          if (matchesQuery(hay) && corr.center?.lat != null && corr.center?.lng != null) {
            const pLat = Number(corr.center.lat);
            const pLng = Number(corr.center.lng);
            const key = `${pLat.toFixed(3)},${pLng.toFixed(3)}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                label: `${corr.name}, ${cityName}`,
                name: corr.name,
                locality: corr.shortName || corr.name,
                city: cityName,
                state: stateName,
                fullAddress: `${corr.name}, ${cityName}, ${stateName}`,
                lat: pLat,
                lng: pLng,
                category: 'office',
                specificity: 78,
                source: 'local_db'
              });
            }
          }
        }
      }

      // 2b. Verified company offices from companyOfficeRegistry.json
      for (const [cityName, companiesMap] of Object.entries(officeRegistry || {})) {
        for (const [compName, info] of Object.entries(companiesMap || {})) {
          const hay = `${compName} ${info.officeName || ''} ${info.locality || ''} ${info.address || ''} ${cityName}`;
          if (matchesQuery(hay) && info.coordinates?.lat != null && info.coordinates?.lng != null) {
            const pLat = Number(info.coordinates.lat);
            const pLng = Number(info.coordinates.lng);
            const key = `${pLat.toFixed(3)},${pLng.toFixed(3)}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                label: info.officeName || `${compName} (${info.locality || cityName})`,
                name: info.officeName || compName,
                locality: info.locality || '',
                city: cityName,
                state: '',
                fullAddress: info.address || `${info.officeName || compName}, ${cityName}`,
                lat: pLat,
                lng: pLng,
                category: 'office',
                specificity: 92,
                source: 'local_db'
              });
            }
          }
        }
      }

      // 2c. High-density tech hub seeds across all Indian cities
      for (const [citySlug, seeds] of Object.entries(TECH_HUB_SEEDS || {})) {
        const displayCity = citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
        for (const seed of (seeds || [])) {
          const hay = `${seed.name || ''} ${seed.locality || ''} ${seed.formatted_address || ''} ${displayCity}`;
          if (matchesQuery(hay) && seed.lat != null && seed.lng != null) {
            const pLat = Number(seed.lat);
            const pLng = Number(seed.lng);
            const key = `${pLat.toFixed(3)},${pLng.toFixed(3)}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                label: seed.name,
                name: seed.name,
                locality: seed.locality || '',
                city: displayCity === 'Gurgaon' ? 'Gurugram' : displayCity,
                state: '',
                fullAddress: seed.formatted_address || `${seed.name}, ${displayCity}`,
                lat: pLat,
                lng: pLng,
                category: 'office',
                specificity: 90,
                source: 'local_db'
              });
            }
          }
        }
      }
    } catch (seedErr) {
      console.warn('[PlacesSearch] Seed search warning:', seedErr.message);
    }

    // 3. Search MongoDB Offices and Companies (only when Mongoose is connected)
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeQuery = escapeRegex(query);
      const reg = new RegExp(safeQuery, 'i');

      const matchingOffices = await Office.find({
        $or: [
          { locality: reg },
          { address: reg }
        ],
        lat: { $ne: null },
        lng: { $ne: null }
      })
      .populate('companyId', 'name')
      .populate('cityId', 'name')
      .limit(10)
      .lean();

      for (const off of matchingOffices) {
        const pLat = off.lat;
        const pLng = off.lng;
        const key = `${pLat.toFixed(3)},${pLng.toFixed(3)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        results.push(buildOfficePlace(off));
      }

      // Also search Company by name
      const matchingCompanies = await Company.find({
        name: reg
      })
      .select('name')
      .limit(10)
      .lean();

      if (matchingCompanies.length > 0) {
        const compIds = matchingCompanies.map(c => c._id);
        const compOffices = await Office.find({
          companyId: { $in: compIds },
          lat: { $ne: null },
          lng: { $ne: null }
        })
        .populate('companyId', 'name')
        .populate('cityId', 'name')
        .limit(10)
        .lean();

        for (const off of compOffices) {
          const pLat = off.lat;
          const pLng = off.lng;
          const key = `${pLat.toFixed(3)},${pLng.toFixed(3)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          results.push(buildOfficePlace(off));
        }
      }
    } catch (dbErr) {
      console.warn('[PlacesSearch] DB search error:', dbErr.message);
    }

    // Distance calculation & proximity-aware precision ordering.
    // A precise office/building within the user's metro area beats a generic city
    // centroid, and a nearby office (e.g. Kolkata when anchor is in Kolkata) beats
    // a faraway office in another state (e.g. Noida).
    if (userLat != null && userLng != null) {
      results.forEach(r => {
        r.distanceKm = calculateDistanceKm(userLat, userLng, r.lat, r.lng);
      });
    }
    results.sort((a, b) => {
      const specA = Number.isFinite(a.specificity) ? a.specificity : 50;
      const specB = Number.isFinite(b.specificity) ? b.specificity : 50;
      const nearA = a.distanceKm != null && a.distanceKm <= 80;
      const nearB = b.distanceKm != null && b.distanceKm <= 80;
      if (nearA !== nearB) return nearA ? -1 : 1;
      if (Math.abs(specB - specA) > 15) return specB - specA;
      if (a.distanceKm == null && b.distanceKm == null) return specB - specA;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return res.status(200).json({
      success: true,
      places: results.slice(0, limitNum)
    });
  } catch (err) {
    console.error('Error in searchPlaces:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Compose a reverse-geocoded label without losing building-level detail.
 * Deduplicates overlapping parts (e.g. "Sector V" vs "Salt Lake Sector V")
 * and keeps the most specific entries first.
 */
function composeReverseLabel(parts, maxParts = 4) {
  const out = [];
  for (const raw of parts) {
    const value = String(raw || '').trim();
    if (value.length < 2) continue;

    const lower = value.toLowerCase();
    let handled = false;
    for (let i = 0; i < out.length; i += 1) {
      const existing = out[i].toLowerCase();
      if (existing === lower || existing.includes(lower)) {
        handled = true;
        break;
      }
      if (lower.includes(existing)) {
        // A longer, more specific part supersedes the shorter one.
        out[i] = value;
        handled = true;
        break;
      }
    }

    if (!handled) out.push(value);
    if (out.length >= maxParts) break;
  }
  return out.join(', ');
}

/**
 * GET /api/directory/places/reverse?lat=...&lng=...
 * Highly accurate reverse geocoding to human-readable neighborhood/locality/city
 */
exports.reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (lat == null || lng == null || lat === '' || lng === '') {
      return res.status(400).json({ success: false, error: 'lat and lng parameters are required' });
    }
    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);
    if (isNaN(numLat) || isNaN(numLng)) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    let label = '';
    let city = '';
    let locality = '';
    let state = '';
    let country = 'India';

    // 1. Check known tech park clusters / IT hubs from detectLocalityFromCoords
    const knownLocalityKolkata = detectLocalityFromCoords(numLat, numLng, 'kolkata');
    const knownLocalityBlr = detectLocalityFromCoords(numLat, numLng, 'bengaluru');
    const knownLocalityHyd = detectLocalityFromCoords(numLat, numLng, 'hyderabad');
    const knownLocalityPune = detectLocalityFromCoords(numLat, numLng, 'pune');
    const knownLocalityNoida = detectLocalityFromCoords(numLat, numLng, 'noida');
    const knownLocalityMumbai = detectLocalityFromCoords(numLat, numLng, 'mumbai');
    const knownLocalityChennai = detectLocalityFromCoords(numLat, numLng, 'chennai');
    const detectedHub = knownLocalityKolkata || knownLocalityBlr || knownLocalityHyd || knownLocalityPune || knownLocalityNoida || knownLocalityMumbai || knownLocalityChennai;

    // 2. If Google Places / Geocoding API key available, query Google Geocoding API
    const apiKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
    if (apiKey) {
      try {
        const gRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${numLat},${numLng}&key=${apiKey}`);
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === 'OK' && gData.results?.length > 0) {
            const first = gData.results[0];
            label = first.formatted_address;
            for (const comp of first.address_components || []) {
              if (comp.types.includes('locality')) city = comp.long_name;
              if (comp.types.includes('sublocality') || comp.types.includes('sublocality_level_1')) locality = comp.long_name;
              if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
              if (comp.types.includes('country')) country = comp.long_name;
            }
            // Keep Google's precise formatted address (building/street level)
            // and only fall back to a hub name when it is missing.
            const googleAddress = first.formatted_address
              ? first.formatted_address.split(',').slice(0, 4).join(',').trim()
              : '';
            if (googleAddress) {
              label = googleAddress;
            } else if (detectedHub) {
              label = composeReverseLabel([locality, detectedHub, city || state]);
            } else if (locality && city) {
              label = composeReverseLabel([locality, city]);
            }
            return res.status(200).json({
              success: true,
              label,
              city: city || locality || '',
              locality,
              state,
              country,
              lat: numLat,
              lng: numLng,
              approximate: false,
              source: 'google_geocoding'
            });
          }
        }
      } catch (gErr) {
        console.warn('[ReverseGeocode] Google API failed:', gErr.message);
      }
    }

    // 3. Query OpenStreetMap Nominatim with zoom=18 and valid User-Agent
    try {
      const osmRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${numLat}&lon=${numLng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'JobRadar/1.0 (contact: admin@jobradar.app)',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(6000)
        }
      );
      if (osmRes.ok) {
        const osmData = await osmRes.json();
        const addr = osmData.address || {};
        const poi = addr.building || addr.amenity || addr.office || addr.shop || addr.tourism || addr.leisure || '';
        const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || '';
        const road = addr.road || '';
        city = addr.city || addr.town || addr.municipality || addr.state_district || '';
        state = addr.state || '';
        country = addr.country || 'India';

        // Greater Kolkata / Bidhannagar normalization for clean display
        let displayCity = city;
        if (city === 'Bidhannagar' && addr.municipality === 'Greater Kolkata') {
          displayCity = 'Kolkata';
        }

        // Building/POI detail beats a generic hub name, and the hub name beats
        // a bare city. composeReverseLabel dedupes overlapping entries.
        label = composeReverseLabel([
          poi,
          neighborhood || road,
          detectedHub,
          displayCity || state
        ]);

        if (!label && osmData.display_name) {
          label = osmData.display_name.split(',').slice(0, 3).join(', ').trim();
        }

        return res.status(200).json({
          success: true,
          label: label || (displayCity ? `${displayCity}, ${state || country}` : 'India'),
          city: displayCity || (detectedHub ? detectedHub : ''),
          locality: neighborhood || road || detectedHub || '',
          state,
          country,
          lat: numLat,
          lng: numLng,
          approximate: false,
          source: 'osm_nominatim'
        });
      }
    } catch (osmErr) {
      console.warn('[ReverseGeocode] OSM Nominatim failed:', osmErr.message);
    }

    // 4. Fallback to Photon reverse geocoder
    try {
      const photonRes = await fetch(`https://photon.komoot.io/reverse?lat=${numLat}&lon=${numLng}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (photonRes.ok) {
        const pData = await photonRes.json();
        const feat = pData.features?.[0]?.properties;
        if (feat) {
          const name = feat.name || '';
          const street = feat.street || '';
          const locality = feat.locality || '';
          const district = feat.district || '';
          city = feat.city || feat.district || '';
          state = feat.state || '';
          country = feat.country || 'India';

          // Preserve POI + block/locality detail from Photon instead of
          // flattening everything to "Name, City".
          label = composeReverseLabel([
            name || street,
            locality,
            district,
            city
          ]);

          return res.status(200).json({
            success: true,
            label: label || (city ? `${city}, ${state || country}` : 'India'),
            city,
            locality: locality || district || '',
            state,
            country,
            lat: numLat,
            lng: numLng,
            approximate: false,
            source: 'photon'
          });
        }
      }
    } catch (_) {}

    // 5. Deterministic Offline Indian Metro & Tech Corridor Centroid Resolver
    const INDIAN_METROS = [
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

    let closest = null;
    let minD = Infinity;
    for (const metro of INDIAN_METROS) {
      const d = calculateDistanceKm(numLat, numLng, metro.lat, metro.lng);
      if (d != null && d < minD) {
        minD = d;
        closest = metro;
      }
    }

    if (detectedHub) {
      city = closest?.city || detectedHub;
      state = closest?.state || state;
      label = `${detectedHub}, ${city}`.replace(/,\s*$/, '');
    } else if (closest && minD <= (closest.maxKm || 30)) {
      label = closest.name === closest.city ? `${closest.city}, ${closest.state}` : `${closest.name}, ${closest.city}`;
      city = closest.city;
      state = closest.state;
    } else if (closest) {
      label = `${closest.city} Region, India`;
      city = closest.city;
      state = closest.state;
    } else {
      label = 'India';
      city = 'India';
    }

    return res.status(200).json({
      success: true,
      label,
      city: city || 'India',
      state: state || '',
      country: 'India',
      lat: numLat,
      lng: numLng,
      // This label came from the curated centroid table, not a geocoder.
      approximate: true,
      source: 'coords'
    });
  } catch (error) {
    console.error('[ReverseGeocode] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Automatically detects and verifies an ATS provider for a company or career URL.
 * POST /api/directory/detect-ats
 */
exports.detectAts = async (req, res) => {
  try {
    const { name, url } = req.body || {};
    if (!url) {
      return res.status(400).json({ success: false, error: 'Target URL or domain is required.' });
    }

    const { detectCompanyAts } = require('../services/atsDetector');
    const result = await detectCompanyAts(name || '', url);

    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    console.error('[DetectATS] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};




