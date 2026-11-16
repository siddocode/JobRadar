/**
 * HTTP Security Headers Middleware
 *
 * Enforces production-grade defensive HTTP response headers without requiring
 * external dependencies. Mitigates clickjacking, MIME-sniffing, XSS, and forces HTTPS.
 */

function securityHeaders(req, res, next) {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking via iframes
  res.setHeader('X-Frame-Options', 'DENY');

  // Legacy XSS filter activation
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy: send origin only on cross-origin requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict access to sensitive browser device features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  // Enforce HSTS (Strict-Transport-Security) in production
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Remove Express fingerprint
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = securityHeaders;
