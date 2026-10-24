const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

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

// GET /api/jobs/:id/eligibility - Analyze job eligibility, freshers suitability, skills & work auth
router.get('/:id/eligibility', jobController.getJobEligibility);

module.exports = router;

