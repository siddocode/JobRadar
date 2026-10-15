const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const City = require('../models/City');

const INITIAL_CITIES = [
  {
    slug: 'kolkata',
    name: 'Kolkata',
    state: 'West Bengal',
    bbox: [22.45, 88.25, 22.65, 88.48],
    active: true
  },
  {
    slug: 'bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    bbox: [12.83, 77.45, 13.15, 77.78],
    active: true
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    bbox: [17.30, 78.30, 17.55, 78.60],
    active: true
  },
  {
    slug: 'pune',
    name: 'Pune',
    state: 'Maharashtra',
    bbox: [18.42, 73.72, 18.65, 74.00],
    active: true
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    bbox: [18.90, 72.75, 19.30, 73.05],
    active: true
  }
];

async function seedCities() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  }

  for (const city of INITIAL_CITIES) {
    await City.findOneAndUpdate(
      { slug: city.slug },
      { $set: city },
      { upsert: true, new: true }
    );
  }

  console.log(`[SeedCities] Seeded ${INITIAL_CITIES.length} cities.`);
}

if (require.main === module) {
  seedCities()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[SeedCities] Error:', err);
      try { await mongoose.disconnect(); } catch (_) {}
      process.exit(1);
    });
}

module.exports = { seedCities, INITIAL_CITIES };
