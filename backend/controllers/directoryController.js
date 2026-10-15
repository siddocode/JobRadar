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

    // Find companies matching query
    const rawCompanies = await Company.find(companyQuery)
      .sort({ name: 1 })
      .lean();

    // Attach open jobs and offices
    const companyIds = rawCompanies.map(c => c._id);
    const [allOffices, allOpenJobs] = await Promise.all([
      Office.find({ companyId: { $in: companyIds } }).populate('cityId', 'name slug state').lean(),
      Job.find({ companyId: { $in: companyIds }, status: 'open' })
        .select('title city state country workMode applyUrl companyId')
        .lean()
    ]);

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
    let processed = rawCompanies.map(comp => {
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
        // Rule: A company is NEVER labelled "hiring" unless a verified open Job exists. Otherwise "No known vacancy"
        hiringStatusLabel: isHiring
          ? `Hiring (${openJobs.length} opening${openJobs.length > 1 ? 's' : ''})`
          : 'No known vacancy'
      };
    });

    // Filter by hiring status
    if (hiring === 'hiring') {
      processed = processed.filter(c => c.isHiring);
    } else if (hiring === 'no_vacancy') {
      processed = processed.filter(c => !c.isHiring);
    }

    const total = processed.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = processed.slice(startIndex, startIndex + limitNum);

    res.status(200).json({
      success: true,
      companies: paginated,
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
    const { city, q } = req.query;

    const companyQuery = {};

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
    } else {
      companyQuery.$or = [
        { 'contact.emails.0': { $exists: true } },
        { 'contact.phones.0': { $exists: true } },
        { followUpStatus: { $in: ['contacted', 'to_contact', 'replied'] } },
        { website: { $ne: null } },
        { careersUrl: { $ne: null } }
      ];
    }

    if (q && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      companyQuery.name = new RegExp(escaped, 'i');
    }

    const companies = await Company.find(companyQuery).sort({ name: 1 }).lean();
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
      total: result.length
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
