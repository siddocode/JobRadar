const express = require('express');
const router = express.Router();
const directoryController = require('../controllers/directoryController');

// Cities directory list
router.get('/cities', directoryController.getCities);

// Companies directory list with hiring status and filters
router.get('/companies', directoryController.getCompanies);

// Reach out list (companies with no known vacancy but contact details)
router.get('/reach-out', directoryController.getReachOutCompanies);

// Update company follow-up status and notes
router.patch('/companies/:id/follow-up', directoryController.updateCompanyFollowUp);

// Uncertain merges review list
router.get('/uncertain-merges', directoryController.getUncertainMerges);
router.post('/uncertain-merges/:id/resolve', directoryController.resolveUncertainMerge);

module.exports = router;
