const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!');
  }
  // Generate an ephemeral random secret in development if not specified
  JWT_SECRET = 'jobradar_jwt_dev_secret_' + crypto.randomBytes(16).toString('hex');
  console.warn('[AuthMiddleware] Warning: JWT_SECRET not set in .env. Using ephemeral development key.');
}

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

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
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
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
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
