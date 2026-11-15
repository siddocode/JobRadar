const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const { requireAuth } = require('../middleware/authMiddleware');

// All application lifecycle endpoints require user authentication
router.use(requireAuth);

router.get('/', applicationController.getApplications);
router.get('/stats', applicationController.getApplicationStats);
router.post('/ingest-message', applicationController.ingestRecruiterMessage);
router.post('/', applicationController.createApplication);
router.patch('/:id', applicationController.updateApplication);
router.post('/:id/dispatch', applicationController.dispatchApplication);
router.delete('/:id', applicationController.deleteApplication);
router.post('/migrate-pipeline', applicationController.migratePipelineToApplications);

module.exports = router;

