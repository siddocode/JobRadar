const express = require('express');
const router = express.Router();
const multer = require('multer');
const jobController = require('../controllers/jobController');

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

// POST /api/jobs/sync - Trigger on-demand job collection
router.post('/sync', jobController.triggerSync);

// GET /api/jobs/sync/status - Check ongoing sync status
router.get('/sync/status', jobController.getSyncStatus);

// POST /api/jobs/harvest?city={cityName} - Automated public ATS job harvest for a city
router.post('/harvest', jobController.harvestJobs);

// GET /api/jobs/harvest/status - Check ongoing automated harvest status
router.get('/harvest/status', jobController.getHarvestState);

// POST /api/jobs/re-enrich - Re-enrich corridor and metadata on existing jobs
router.post('/re-enrich', jobController.reEnrichJobs);

// GET /api/jobs/audit-urls - Audit applyUrl patterns across all jobs
router.get('/audit-urls', jobController.auditUrls);

// POST /api/jobs/fix-urls - Fix broken or guessed applyUrls across all jobs
router.post('/fix-urls', jobController.fixBrokenUrls);

// GET /api/jobs/:id/eligibility - Analyze job eligibility, freshers suitability, skills & work auth
router.get('/:id/eligibility', jobController.getJobEligibility);

const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');

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

