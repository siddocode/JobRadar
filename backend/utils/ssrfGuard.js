/**
 * SSRF (Server-Side Request Forgery) Protection Guard
 *
 * Validates external URLs against RFC 1918 private IPv4 subnets, link-local addresses,
 * cloud metadata endpoints (169.254.169.254), IPv6 private/multicast ranges, and
 * IPv4-mapped IPv6 address variations.
 *
 * Resolves hostnames via DNS before evaluation to prevent DNS rebinding attacks.
 */

const dns = require('node:dns').promises;
const net = require('node:net');

/**
 * Checks if an IP address belongs to private, loopback, link-local, carrier-grade NAT,
 * or multicast IP ranges.
 *
 * @param {string} rawAddress - IPv4 or IPv6 address string
 * @returns {boolean} True if the address is private / non-routable
 */
function isPrivateAddress(rawAddress) {
  if (!rawAddress || typeof rawAddress !== 'string') return true;

  let address = rawAddress.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 addresses (e.g. "::ffff:169.254.169.254" or "::ffff:127.0.0.1")
  if (address.startsWith('::ffff:')) {
    const mappedIpv4 = address.replace('::ffff:', '');
    if (net.isIP(mappedIpv4) === 4) {
      address = mappedIpv4;
    }
  }

  // IPv4 evaluation
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed IP
    }

    const [b0, b1, b2, b3] = parts;

    // 0.0.0.0/8 (Current network)
    if (b0 === 0) return true;

    // 10.0.0.0/8 (RFC 1918 Private)
    if (b0 === 10) return true;

    // 100.64.0.0/10 (Shared address / Carrier-grade NAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;

    // 169.254.0.0/16 (Link-local / Cloud Metadata: AWS/GCP/Azure)
    if (b0 === 169 && b1 === 254) return true;

    // 172.16.0.0/12 (RFC 1918 Private)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (b0 === 192 && b1 === 0 && b2 === 0) return true;

    // 192.168.0.0/16 (RFC 1918 Private)
    if (b0 === 192 && b1 === 168) return true;

    // 198.18.0.0/15 (Benchmarking)
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (b0 >= 224 && b0 <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future use: 240.0.0.0 - 255.255.255.254)
    if (b0 >= 240) return true;

    return false;
  }

  // IPv6 evaluation
  if (net.isIP(address) === 6) {
    // Loopback (::1) and Unspecified (::)
    if (address === '::1' || address === '::') return true;

    // Link-local unicast (fe80::/10)
    if (address.startsWith('fe8') || address.startsWith('fe9') ||
        address.startsWith('fea') || address.startsWith('feb')) {
      return true;
    }

    // Unique Local Addresses (fc00::/7 - fc00:: and fd00::)
    if (address.startsWith('fc') || address.startsWith('fd')) return true;

    // Multicast (ff00::/8)
    if (address.startsWith('ff')) return true;

    return false;
  }

  return true; // Non-IP or invalid string treated as unsafe
}

/**
 * Validates whether a URL targets a routable, public internet address.
 * Rejects non-HTTP protocols, embedded credentials, local hostnames, and private IPs.
 *
 * @param {string} urlString - Target URL to inspect
 * @returns {Promise<boolean>} True if URL is verified public
 */
async function isPublicWebUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;

  try {
    const parsed = new URL(urlString.trim());

    // Protocol check: only http and https allowed
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Reject embedded credentials (e.g. "http://admin:secret@host")
    if (parsed.username || parsed.password) return false;

    // Reject standard local and internal hostname suffixes
    const hostname = parsed.hostname.toLowerCase().trim();
    if (!hostname) return false;

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.corp')
    ) {
      return false;
    }

    // Direct IP evaluation
    if (net.isIP(hostname)) {
      return !isPrivateAddress(hostname);
    }

    // Resolve hostname to all associated IPs to evaluate DNS rebinding and internal resolutions
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) return false;

    // ALL resolved addresses must be public
    return addresses.every(({ address }) => !isPrivateAddress(address));
  } catch (_) {
    return false;
  }
}

module.exports = {
  isPrivateAddress,
  isPublicWebUrl
};

