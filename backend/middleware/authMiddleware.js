const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'jobradar_jwt_dev_secret_key_2026';

function getTokenFromReq(req) {
  // 1. From parsed cookies (cookie-parser)
  if (req.cookies && req.cookies.jobradar_auth_token) {
    return req.cookies.jobradar_auth_token;
  }
  // 2. From raw cookie header
  if (req.headers && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)jobradar_auth_token=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  // 3. From Authorization Bearer header
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication token is required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired session token'
    });
  }
}

function optionalAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } else {
      req.user = null;
    }
  } catch (_) {
    req.user = null;
  }
  next();
}

module.exports = {
  JWT_SECRET,
  requireAuth,
  optionalAuth
};
