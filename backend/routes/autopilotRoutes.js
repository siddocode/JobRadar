const express = require('express');
const router = express.Router();
const autopilotController = require('../controllers/autopilotController');
const { requireAuth } = require('../middleware/authMiddleware');

// All autopilot endpoints require user authentication
router.use(requireAuth);

router.get('/config', autopilotController.getConfig);
router.put('/config', autopilotController.updateConfig);
router.get('/runs', autopilotController.getRuns);
router.post('/trigger', autopilotController.triggerRun);

module.exports = router;

