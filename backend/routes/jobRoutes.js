const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// GET /api/jobs - Query filters: q, city, state, country, workMode, location, status, company, page, limit
router.get('/', jobController.getJobs);

// GET /api/jobs/cities - Aggregate cities that have jobs
router.get('/cities', jobController.getCities);

// GET /api/jobs/stats - Aggregate counts and latest sync runs
router.get('/stats', jobController.getJobStats);

module.exports = router;
