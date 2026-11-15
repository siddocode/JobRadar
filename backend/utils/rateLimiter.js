/**
 * Enforces per-host rate limiting (maximum 1 request/second per host).
 */

const MIN_INTERVAL_MS = 1000;
const lastRequestTimeByHost = new Map();

/**
 * Delays execution until at least 1 second has elapsed since the last request to this host.
 *
 * @param {string} host - Hostname or domain key (e.g. 'boards-api.greenhouse.io')
 */
async function rateLimitHost(host) {
  const now = Date.now();
  const lastTime = lastRequestTimeByHost.get(host) || 0;
  const elapsed = now - lastTime;

  if (elapsed < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTimeByHost.set(host, Date.now());
}

/**
 * In-memory sliding-window rate limiter middleware for Express.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Window time in milliseconds
 * @param {number} options.max - Maximum allowed requests in window
 * @param {string} [options.message] - Custom error message
 */
function createRateLimiter({ windowMs = 60000, max = 100, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map();

  // Periodic cleanup of expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now - record.startTime > windowMs) {
        hits.delete(key);
      }
    }
  }, 300000).unref();

  return (req, res, next) => {
    // Determine client identifier (authenticated user ID or client IP)
    const clientKey = req.user?.id || req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = hits.get(clientKey);
    if (!record || (now - record.startTime > windowMs)) {
      record = { count: 1, startTime: now };
      hits.set(clientKey, record);
    } else {
      record.count += 1;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.startTime + windowMs - now) / 1000));
      return res.status(429).json({
        success: false,
        error: message
      });
    }

    next();
  };
}

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
});

const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 180,
  message: 'API rate limit exceeded. Please throttle requests.'
});

module.exports = {
  rateLimitHost,
  createRateLimiter,
  authLimiter,
  generalApiLimiter,
  MIN_INTERVAL_MS
};
