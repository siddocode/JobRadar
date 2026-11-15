const express = require('express');
const router = express.Router();
const multer = require('multer');
const jobController = require('../controllers/jobController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');

// Multer in-memory storage for PDF CV upload (up to 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are supported for CV upload.'));
    }
  }
});

// GET /api/jobs - Query filters: q, city, state, country, workMode, location, status, company, page, limit
router.get('/', jobController.getJobs);

// GET /api/jobs/cities - Aggregate cities that have jobs
router.get('/cities', jobController.getCities);

// GET /api/jobs/countries - Aggregate countries that have jobs
router.get('/countries', jobController.getCountries);

// GET /api/jobs/stats - Aggregate counts and latest sync runs
router.get('/stats', jobController.getJobStats);

// GET /api/jobs/queue-status - Background task queue metrics & telemetry (Protected)
router.get('/queue-status', requireAuth, async (req, res) => {
  try {
    const { getQueueStats } = require('../services/jobQueue');
    const stats = await getQueueStats();
    res.status(200).json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/jobs/sync - Trigger on-demand job collection (Protected)
router.post('/sync', requireAuth, jobController.triggerSync);

// GET /api/jobs/sync/status - Check ongoing sync status
router.get('/sync/status', jobController.getSyncStatus);

// POST /api/jobs/harvest?city={cityName} - Automated public ATS job harvest for a city (Protected)
router.post('/harvest', requireAuth, jobController.harvestJobs);

// GET /api/jobs/harvest/status - Check ongoing automated harvest status
router.get('/harvest/status', jobController.getHarvestState);

// POST /api/jobs/re-enrich - Re-enrich corridor and metadata on existing jobs (Protected)
router.post('/re-enrich', requireAuth, jobController.reEnrichJobs);

// GET /api/jobs/audit-urls - Audit applyUrl patterns across all jobs (Protected)
router.get('/audit-urls', requireAuth, jobController.auditUrls);

// POST /api/jobs/fix-urls - Fix broken or guessed applyUrls across all jobs (Protected)
router.post('/fix-urls', requireAuth, jobController.fixBrokenUrls);

// GET /api/jobs/:id/eligibility - Analyze job eligibility, freshers suitability, skills & work auth
router.get('/:id/eligibility', jobController.getJobEligibility);

// Candidate CV / Portfolio parsing & match endpoints (AUTHENTICATION REQUIRED)
// POST /api/jobs/candidate/parse-cv - Upload and parse candidate CV PDF
router.post('/candidate/parse-cv', requireAuth, upload.single('cv'), jobController.parseCandidateCv);

// POST /api/jobs/candidate/parse-url - Fetch and parse candidate portfolio website
router.post('/candidate/parse-url', requireAuth, jobController.parseCandidateUrl);

// POST /api/jobs/:id/check-candidate-eligibility - Match candidate with a specific job (supports optional direct CV upload)
router.post('/:id/check-candidate-eligibility', requireAuth, upload.single('cv'), jobController.checkCandidateEligibility);

// POST /api/jobs/evaluate-candidate - Arbitrary match evaluation with client job payload
router.post('/evaluate-candidate', requireAuth, jobController.evaluateDirectMatch);

// POST /api/jobs/:id/tailor-cv - Tailor CV specifically for a job (AUTHENTICATION REQUIRED)
router.post('/:id/tailor-cv', requireAuth, upload.single('cv'), jobController.tailorCvForJob);

module.exports = router;

