const { URL } = require('url');

/**
 * Extracts a normalized domain from a URL (e.g. "https://www.example.com/careers" -> "example.com")
 */
function extractDomain(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  let raw = inputUrl.trim();
  if (!raw) return null;

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = 'https://' + raw;
  }

  try {
    const parsed = new URL(raw);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    // Basic validation: must contain a dot and at least 2 chars
    if (host.includes('.') && host.length >= 4) {
      return host;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a company name for fuzzy matching and deduplication
 */
function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';
  let cleaned = name.toLowerCase().trim();

  // Remove common Indian & global corporate suffixes
  cleaned = cleaned
    .replace(/\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|limited|inc\.?|incorporated|llp|llc|corp\.?|corporation)\b/gi, '')
    .replace(/\b(technologies|technology|solutions|services|systems|software|global|india)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Generates a clean URL slug from a name
 */
function slugify(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Simple bigram-based Sorensen-Dice similarity score (0.0 to 1.0)
 */
function stringSimilarity(str1, str2) {
  const s1 = (str1 || '').toLowerCase().trim();
  const s2 = (str2 || '').toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2 || s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  let intersection = 0;

  for (const [bigram, count] of b1.entries()) {
    if (b2.has(bigram)) {
      intersection += Math.min(count, b2.get(bigram));
    }
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0;
}

/**
 * Links unassigned jobs in Job collection to the given company
 */
async function linkJobsForCompany(company, Job) {
  if (!company || !Job) return 0;
  try {
    const cleanName = company.name.trim();
    const cleanSlug = company.slug.trim();

    // Match exact name, or case-insensitive exact name
    const query = {
      companyId: null,
      $or: [
        { company: cleanName },
        { company: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      ]
    };

    if (company.atsSlug) {
      query.$or.push({ company: company.atsSlug });
    }

    const res = await Job.updateMany(query, {
      $set: { companyId: company._id }
    });

    return res.modifiedCount || 0;
  } catch (err) {
    console.error(`Error linking jobs for company ${company.name}:`, err.message);
    return 0;
  }
}

module.exports = {
  extractDomain,
  normalizeCompanyName,
  slugify,
  stringSimilarity,
  linkJobsForCompany
};
