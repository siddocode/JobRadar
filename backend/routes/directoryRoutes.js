const express = require('express');
const router = express.Router();
const directoryController = require('../controllers/directoryController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');

// Cities directory list & creation
router.get('/cities', directoryController.getCities);
router.post('/cities', directoryController.addCity);

// City-wise OpenStreetMap startup / company discovery
router.post('/discover-city', directoryController.discoverCity);
router.get('/discover-city/status', directoryController.getDiscoveryStatus);

// City-wise Google Places discovery
router.post('/scan-google-places', directoryController.scanGooglePlaces);
router.get('/scan-google-places/status', directoryController.getGooglePlacesScanStatus);

// Directory aggregate stats for metric cards
router.get('/stats', directoryController.getDirectoryStats);

// Companies directory list with hiring status and filters
router.get('/companies', optionalAuth, directoryController.getCompanies);
router.post('/companies', directoryController.createCompany);




// Reach out list (companies with no known vacancy but contact details)
router.get('/reach-out', optionalAuth, directoryController.getReachOutCompanies);

// Update company follow-up status and notes (Protected: requires authentication)
router.patch('/companies/:id/follow-up', requireAuth, directoryController.updateCompanyFollowUp);

// Uncertain merges review list
router.get('/uncertain-merges', directoryController.getUncertainMerges);
router.post('/uncertain-merges/:id/resolve', directoryController.resolveUncertainMerge);

module.exports = router;
