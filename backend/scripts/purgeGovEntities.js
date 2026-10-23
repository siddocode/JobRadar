/**
 * Script to purge government, municipal, educational boards, and non-tech civic offices
 * from Company and Office collections.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Company = require('../models/Company');
const Office = require('../models/Office');
const Job = require('../models/Job');
const { isGovernmentOrNonTechEntity } = require('../utils/companyUtils');

async function purgeGovEntities() {
  console.log('[Purge] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar');

  const allComps = await Company.find({}).lean();
  console.log(`[Purge] Total companies in DB: ${allComps.length}`);

  const toDelete = allComps.filter(c => {
    return isGovernmentOrNonTechEntity({
      name: c.name,
      website: c.website,
      domain: c.domain,
      tags: { category: c.category }
    });
  });

  console.log(`[Purge] Identified ${toDelete.length} government / non-tech civic entities for removal.`);

  if (toDelete.length > 0) {
    const ids = toDelete.map(c => c._id);

    // 1. Check if any jobs are linked (precautionary)
    const linkedJobs = await Job.countDocuments({ companyId: { $in: ids } });
    if (linkedJobs > 0) {
      console.log(`[Purge] Unlinking ${linkedJobs} jobs from these entities...`);
      await Job.updateMany({ companyId: { $in: ids } }, { $set: { companyId: null } });
    }

    // 2. Delete Office records
    const officeRes = await Office.deleteMany({ companyId: { $in: ids } });
    console.log(`[Purge] Removed ${officeRes.deletedCount} associated office locations.`);

    // 3. Delete Company records
    const compRes = await Company.deleteMany({ _id: { $in: ids } });
    console.log(`[Purge] Removed ${compRes.deletedCount} government/civic companies.`);

    toDelete.forEach((c, idx) => {
      console.log(`  ${idx + 1}. [Removed] ${c.name} (${c.website || 'No website'})`);
    });
  }

  // 4. Clean cache files in data/cache
  const cacheDir = path.join(__dirname, '../data/cache');
  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const fullPath = path.join(cacheDir, file);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.elements)) {
          const beforeCount = data.elements.length;
          data.elements = data.elements.filter(el => {
            const tags = el.tags || {};
            if (!tags.name) return false;
            return !isGovernmentOrNonTechEntity({
              name: tags.name,
              website: tags.website || tags['contact:website'] || tags.url,
              tags
            });
          });
          const removed = beforeCount - data.elements.length;
          fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
          console.log(`[Cache] Cleaned ${file}: removed ${removed} non-tech/gov elements (${data.elements.length} remain).`);
        }
      } catch (err) {
        console.warn(`[Cache] Could not clean ${file}:`, err.message);
      }
    }
  }

  console.log('\n[Purge] Cleanup complete!');
  await mongoose.disconnect();
}

purgeGovEntities().catch(err => {
  console.error('[Purge] Failed:', err);
  process.exit(1);
});
