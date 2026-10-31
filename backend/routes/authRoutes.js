const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// Public auth endpoints
router.post('/check-email', authController.checkEmail);
router.post('/send-otp', authController.sendOtp);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/login-otp', authController.loginWithOtp);
router.post('/logout', authController.logout);

// Protected auth endpoints
router.get('/me', requireAuth, authController.getMe);
router.post('/candidate-profile', requireAuth, authController.saveCandidateProfile);

module.exports = router;
