const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/authMiddleware');

// In-memory store for pending email OTPs (expires in 10 minutes)
const pendingOtps = new Map();

// Helper to generate a 6-digit numeric OTP
function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/auth/send-otp
 * Generates an OTP for the given email and returns devOtp (demo mode)
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const otpCode = generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in-memory
    pendingOtps.set(cleanEmail, { code: otpCode, expiresAt });

    // Also update existing user record if one exists
    await User.findOneAndUpdate(
      { email: cleanEmail },
      { $set: { 'otp.code': otpCode, 'otp.expiresAt': expiresAt } }
    );

    console.log(`[Auth] Verification OTP for ${cleanEmail}: ${otpCode}`);

    // Return the OTP in devOtp for banner display until real SMTP is configured
    return res.status(200).json({
      success: true,
      message: 'Verification code sent. In demo mode, use the code displayed above.',
      email: cleanEmail,
      devOtp: otpCode
    });
  } catch (err) {
    console.error('Error generating OTP:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate verification code' });
  }
};

/**
 * POST /api/auth/register
 * Verifies the OTP, hashes password, and creates a verified user account
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, otp } = req.body;

    if (!email || !password || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and 6-digit OTP code are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    // Verify OTP against pendingOtps map or DB
    const memoryRecord = pendingOtps.get(cleanEmail);
    let isOtpValid = false;

    if (memoryRecord && memoryRecord.code === cleanOtp && memoryRecord.expiresAt > new Date()) {
      isOtpValid = true;
    } else {
      const existingUserOtp = await User.findOne({
        email: cleanEmail,
        'otp.code': cleanOtp,
        'otp.expiresAt': { $gt: new Date() }
      });
      if (existingUserOtp) {
        isOtpValid = true;
      }
    }

    if (!isOtpValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code. Please request a new code.'
      });
    }

    // Check if user is already registered with a password
    let user = await User.findOne({ email: cleanEmail });
    if (user && user.isVerified && user.password) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists. Please log in.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = name?.trim() || cleanEmail.split('@')[0];

    if (user) {
      user.password = hashedPassword;
      user.name = displayName;
      user.isVerified = true;
      user.otp = { code: null, expiresAt: null };
      await user.save();
    } else {
      user = await User.create({
        email: cleanEmail,
        password: hashedPassword,
        name: displayName,
        isVerified: true,
        otp: { code: null, expiresAt: null }
      });
    }

    // Clear pending memory OTP
    pendingOtps.delete(cleanEmail);

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created and verified successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
};

/**
 * POST /api/auth/login
 * Simple email & password login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'No account found with this email. Please sign up.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password'
      });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
};

/**
 * POST /api/auth/login-otp
 * Login directly with email & verified OTP
 */
exports.loginWithOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const memoryRecord = pendingOtps.get(cleanEmail);
    let isOtpValid = false;

    if (memoryRecord && memoryRecord.code === cleanOtp && memoryRecord.expiresAt > new Date()) {
      isOtpValid = true;
    } else {
      const existingUserOtp = await User.findOne({
        email: cleanEmail,
        'otp.code': cleanOtp,
        'otp.expiresAt': { $gt: new Date() }
      });
      if (existingUserOtp) {
        isOtpValid = true;
      }
    }

    if (!isOtpValid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
    }

    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      // Auto-create verified user with temporary random password
      const randomPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      user = await User.create({
        email: cleanEmail,
        password: hashedPassword,
        name: cleanEmail.split('@')[0],
        isVerified: true
      });
    }

    pendingOtps.delete(cleanEmail);

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully with OTP',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error('OTP Login error:', err);
    return res.status(500).json({ success: false, error: 'Login with OTP failed' });
  }
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email name isVerified createdAt');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve profile' });
  }
};
