const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const { requireAuth } = require('../middleware/authMiddleware');

// All application lifecycle endpoints require user authentication
router.use(requireAuth);

router.get('/', applicationController.getApplications);
router.get('/stats', applicationController.getApplicationStats);
router.post('/stage', applicationController.stageApplication);
router.post('/ingest-message', applicationController.ingestRecruiterMessage);

// Gmail OAuth 2.0 Integration Endpoints (Free Tier https://www.googleapis.com/auth/gmail.readonly)
router.get('/gmail/auth-url', applicationController.getGmailAuthUrl);
router.post('/gmail/exchange', applicationController.exchangeGmailAuthCode);
router.get('/gmail/status', applicationController.getGmailStatus);
router.post('/gmail/sync', applicationController.syncGmailInbox);
router.post('/gmail/disconnect', applicationController.disconnectGmail);

router.post('/', applicationController.createApplication);
router.patch('/:id', applicationController.updateApplication);
router.post('/:id/dispatch', applicationController.dispatchApplication);
router.delete('/:id', applicationController.deleteApplication);
router.post('/migrate-pipeline', applicationController.migratePipelineToApplications);

module.exports = router;

