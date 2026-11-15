const express = require('express');
const router = express.Router();
const directoryController = require('../controllers/directoryController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');

// Cities directory list & creation
router.get('/cities', directoryController.getCities);
router.post('/cities', requireAuth, directoryController.addCity);

// City-wise OpenStreetMap startup / company discovery (Protected)
router.post('/discover-city', requireAuth, directoryController.discoverCity);
router.get('/discover-city/status', directoryController.getDiscoveryStatus);

// City-wise Google Places discovery (Protected)
router.post('/scan-google-places', requireAuth, directoryController.scanGooglePlaces);
router.get('/scan-google-places/status', directoryController.getGooglePlacesScanStatus);

// Directory aggregate stats for metric cards
router.get('/stats', directoryController.getDirectoryStats);

// Companies directory list with hiring status and filters
router.get('/companies', optionalAuth, directoryController.getCompanies);
router.post('/companies', requireAuth, directoryController.createCompany);

// Places & address autocomplete search biased to GPS
router.get('/places/search', directoryController.searchPlaces);
router.get('/places/reverse', directoryController.reverseGeocode);
// Reach out list (companies with no known vacancy but contact details)
router.get('/reach-out', optionalAuth, directoryController.getReachOutCompanies);

// Update company follow-up status and notes (Protected: requires authentication)
router.patch('/companies/:id/follow-up', requireAuth, directoryController.updateCompanyFollowUp);

// Uncertain merges review list (Protected)
router.get('/uncertain-merges', requireAuth, directoryController.getUncertainMerges);
router.post('/uncertain-merges/:id/resolve', requireAuth, directoryController.resolveUncertainMerge);

// Automated ATS detection & verification (Protected)
router.post('/detect-ats', requireAuth, directoryController.detectAts);

module.exports = router;
