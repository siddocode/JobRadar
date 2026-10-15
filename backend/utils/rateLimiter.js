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

module.exports = {
  rateLimitHost,
  MIN_INTERVAL_MS
};
