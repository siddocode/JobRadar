const Job = require('../models/Job');
const SourceRun = require('../models/SourceRun');

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

    // Filter by city
    if (city && typeof city === 'string' && city.trim() && city !== 'all') {
      const sanitizedCity = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.city = { $regex: new RegExp(`^${sanitizedCity}$`, 'i') };
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
      filter.$or = [
        { locationRaw: { $regex: sanitizedLoc, $options: 'i' } },
        { location: { $regex: sanitizedLoc, $options: 'i' } }
      ];
    }

    // Filter by status ('open', 'closed', 'all') - default: 'open'
    if (status && status !== 'all') {
      if (['open', 'closed'].includes(status.toLowerCase())) {
        filter.status = status.toLowerCase();
      }
    }

    // Filter by company
    if (company && typeof company === 'string' && company.trim() && company !== 'all') {
      filter.company = company.trim();
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    // Execute queries in parallel
    const [jobs, totalCount, openCount, totalInDb] = await Promise.all([
      Job.find(filter)
        .sort({ lastSeenAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .select('source sourceJobId company title location locationRaw city state country workMode fingerprint applyUrl updatedAt firstSeenAt lastSeenAt status')
        .lean(),
      Job.countDocuments(filter),
      Job.countDocuments({ status: 'open' }),
      Job.countDocuments()
    ]);

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
        }
      }
    }

    return res.status(200).json({
      success: true,
      meta: {
        total: totalCount,
        openTotal: openCount,
        totalInDb,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit) || 1
      },
      jobs: deduplicatedJobs
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

module.exports = {
  getJobs,
  getCities,
  getCountries,
  getJobStats,
  triggerSync,
  getSyncStatus
};

