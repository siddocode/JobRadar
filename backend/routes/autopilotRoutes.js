const express = require('express');
const router = express.Router();
const autopilotController = require('../controllers/autopilotController');
const { requireAuth } = require('../middleware/authMiddleware');

// All autopilot endpoints require user authentication
router.use(requireAuth);

router.get('/config', autopilotController.getConfig);
router.put('/config', autopilotController.updateConfig);
router.post('/pause', autopilotController.pauseAutopilot);
router.post('/resume', autopilotController.resumeAutopilot);
router.post('/stop', autopilotController.stopAutopilot);
router.get('/status', autopilotController.getEngineStatus);
router.get('/runs', autopilotController.getRuns);
router.post('/trigger', autopilotController.triggerRun);
router.post('/maintenance', autopilotController.triggerMaintenance);

module.exports = router;

