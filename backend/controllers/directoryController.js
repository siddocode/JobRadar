const Company = require('../models/Company');
const Office = require('../models/Office');
const City = require('../models/City');
const Job = require('../models/Job');
const UncertainMerge = require('../models/UncertainMerge');

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
      companyQuery.followUpStatus = followUp;
    }

    // City filter
    let cityRecord = null;
    if (city && city !== 'all') {
      cityRecord = await City.findOne({ slug: city.toLowerCase() });
      if (cityRecord) {
        const officesInCity = await Office.find({ cityId: cityRecord._id }, 'companyId');
        const companyIdsInCity = officesInCity.map(o => o.companyId);
        companyQuery._id = { $in: companyIdsInCity };
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

    // Fast count at database level
    console.time('[Perf] countDocuments');
    const total = await Company.countDocuments(companyQuery);
    console.timeEnd('[Perf] countDocuments');

    const startIndex = (pageNum - 1) * limitNum;

    // Fast database-level pagination
    console.time('[Perf] findPaginated');
    const paginatedCompanies = await Company.find(companyQuery)
      .sort({ name: 1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();
    console.timeEnd('[Perf] findPaginated');

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

    // Assemble company cards with strictly verified hiring status
    const processed = paginatedCompanies.map(comp => {
      const cId = comp._id.toString();
      const openJobs = jobsMap[cId] || [];
      const offices = officesMap[cId] || [];
      const isHiring = openJobs.length > 0;

      return {
        ...comp,
        offices,
        openJobs,
        openJobsCount: openJobs.length,
        isHiring,
        hiringStatusLabel: isHiring
          ? `Hiring (${openJobs.length} opening${openJobs.length > 1 ? 's' : ''})`
          : 'No known vacancy'
      };
    });

    res.status(200).json({
      success: true,
      companies: processed,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('Error fetching directory companies:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch companies' });
  }
};


/**
 * GET /api/directory/reach-out
 * Lists companies with outreach channels for cold/direct outreach
 */
exports.getReachOutCompanies = async (req, res) => {
  try {
    const { city, q, status } = req.query;

    const companyQuery = {};

    // Filter by outreach pipeline stage
    if (status && status !== 'all') {
      companyQuery.followUpStatus = status;
    } else {
      companyQuery.followUpStatus = { $in: ['to_contact', 'contacted', 'replied', 'not_interested'] };
    }

    if (city && city !== 'all') {
      const cityRecord = await City.findOne({ slug: city.toLowerCase() });
      if (cityRecord) {
        const officesInCity = await Office.find({ cityId: cityRecord._id }, 'companyId');
        companyQuery._id = { $in: officesInCity.map(o => o.companyId) };
      } else {
        const matchingOffices = await Office.find({
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

    // Pipeline stage counts aggregation (respecting city and search if present)
    const stageMatch = {
      followUpStatus: { $in: ['to_contact', 'contacted', 'replied', 'not_interested'] }
    };
    if (companyQuery._id) {
      stageMatch._id = companyQuery._id;
    }
    if (companyQuery.name) {
      stageMatch.name = companyQuery.name;
    }

    const [companies, stageAggregation] = await Promise.all([
      Company.find(companyQuery).sort({ updatedAt: -1, name: 1 }).lean(),
      Company.aggregate([
        { $match: stageMatch },
        { $group: { _id: '$followUpStatus', count: { $sum: 1 } } }
      ])
    ]);

    const stageCounts = {
      all: 0,
      to_contact: 0,
      contacted: 0,
      replied: 0,
      not_interested: 0
    };

    stageAggregation.forEach(item => {
      if (item._id && stageCounts.hasOwnProperty(item._id)) {
        stageCounts[item._id] = item.count;
      }
      stageCounts.all += item.count;
    });

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

    const result = companies.map(comp => {
      const cId = comp._id.toString();
      const isHiring = hiringCompanyIds.has(cId);
      const offices = officesMap[cId] || [];

      // Ensure every outreach company has direct contact channels
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

      return {
        ...comp,
        contact: {
          ...comp.contact,
          emails,
          phones
        },
        offices,
        isHiring,
        hiringStatusLabel: isHiring ? 'Hiring (Open roles available)' : 'No known vacancy'
      };
    });

    res.status(200).json({
      success: true,
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
 * Updates followUpStatus and notes
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

    const company = await Company.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company not found' });
    }

    res.status(200).json({ success: true, company });
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


