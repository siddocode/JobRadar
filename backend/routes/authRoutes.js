const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { authLimiter } = require('../utils/rateLimiter');

// Public auth endpoints (Rate-limited OTP dispatches)
router.post('/check-email', authController.checkEmail);
router.post('/send-otp', authLimiter, authController.sendOtp);
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/login-otp', authLimiter, authController.loginWithOtp);
router.post('/logout', authController.logout);

// Protected auth endpoints
router.get('/me', requireAuth, authController.getMe);
router.post('/candidate-profile', requireAuth, authController.saveCandidateProfile);

module.exports = router;
