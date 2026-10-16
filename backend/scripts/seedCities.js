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
  },
  {
    slug: 'gurgaon',
    name: 'Gurgaon',
    state: 'Haryana',
    bbox: [28.38, 76.95, 28.55, 77.15],
    active: true
  },
  {
    slug: 'noida',
    name: 'Noida',
    state: 'Uttar Pradesh',
    bbox: [28.48, 77.28, 28.65, 77.45],
    active: true
  },
  {
    slug: 'delhi-ncr',
    name: 'Delhi NCR',
    state: 'Delhi',
    bbox: [28.40, 76.90, 28.85, 77.40],
    active: true
  },
  {
    slug: 'chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    bbox: [12.92, 80.12, 13.18, 80.32],
    active: true
  },
  {
    slug: 'ahmedabad',
    name: 'Ahmedabad',
    state: 'Gujarat',
    bbox: [22.95, 72.48, 23.12, 72.68],
    active: true
  },
  {
    slug: 'kochi',
    name: 'Kochi',
    state: 'Kerala',
    bbox: [9.92, 76.22, 10.08, 76.38],
    active: true
  },
  {
    slug: 'jaipur',
    name: 'Jaipur',
    state: 'Rajasthan',
    bbox: [26.80, 75.70, 27.00, 75.90],
    active: true
  },
  {
    slug: 'indore',
    name: 'Indore',
    state: 'Madhya Pradesh',
    bbox: [22.65, 75.80, 22.80, 75.95],
    active: true
  },
  {
    slug: 'chandigarh',
    name: 'Chandigarh',
    state: 'Punjab / Chandigarh',
    bbox: [30.68, 76.70, 30.78, 76.85],
    active: true
  },
  {
    slug: 'coimbatore',
    name: 'Coimbatore',
    state: 'Tamil Nadu',
    bbox: [10.95, 76.90, 11.08, 77.05],
    active: true
  },
  {
    slug: 'thiruvananthapuram',
    name: 'Thiruvananthapuram',
    state: 'Kerala',
    bbox: [8.45, 76.88, 8.58, 77.00],
    active: true
  },
  {
    slug: 'bhubaneswar',
    name: 'Bhubaneswar',
    state: 'Odisha',
    bbox: [20.22, 85.75, 20.35, 85.90],
    active: true
  },
  {
    slug: 'lucknow',
    name: 'Lucknow',
    state: 'Uttar Pradesh',
    bbox: [26.78, 80.88, 26.93, 81.03],
    active: true
  },
  {
    slug: 'nagpur',
    name: 'Nagpur',
    state: 'Maharashtra',
    bbox: [21.08, 79.00, 21.22, 79.15],
    active: true
  },
  {
    slug: 'visakhapatnam',
    name: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    bbox: [17.65, 83.18, 17.80, 83.35],
    active: true
  },
  {
    slug: 'surat',
    name: 'Surat',
    state: 'Gujarat',
    bbox: [21.12, 72.78, 21.26, 72.92],
    active: true
  },
  {
    slug: 'vadodara',
    name: 'Vadodara',
    state: 'Gujarat',
    bbox: [22.25, 73.12, 22.38, 73.25],
    active: true
  },
  {
    slug: 'bhopal',
    name: 'Bhopal',
    state: 'Madhya Pradesh',
    bbox: [23.18, 77.35, 23.32, 77.48],
    active: true
  },
  {
    slug: 'mysuru',
    name: 'Mysuru',
    state: 'Karnataka',
    bbox: [12.25, 76.60, 12.38, 76.72],
    active: true
  },
  {
    slug: 'mangaluru',
    name: 'Mangaluru',
    state: 'Karnataka',
    bbox: [12.82, 74.80, 12.95, 74.92],
    active: true
  },
  {
    slug: 'dehradun',
    name: 'Dehradun',
    state: 'Uttarakhand',
    bbox: [30.28, 77.98, 30.40, 78.10],
    active: true
  },
  {
    slug: 'patna',
    name: 'Patna',
    state: 'Bihar',
    bbox: [25.56, 85.08, 25.66, 85.22],
    active: true
  },
  {
    slug: 'ranchi',
    name: 'Ranchi',
    state: 'Jharkhand',
    bbox: [23.30, 85.28, 23.40, 85.40],
    active: true
  },
  {
    slug: 'guwahati',
    name: 'Guwahati',
    state: 'Assam',
    bbox: [26.10, 91.70, 26.22, 91.85],
    active: true
  },
  {
    slug: 'goa',
    name: 'Goa',
    state: 'Goa',
    bbox: [15.25, 73.75, 15.55, 74.00],
    active: true
  },
  {
    slug: 'vijayawada',
    name: 'Vijayawada',
    state: 'Andhra Pradesh',
    bbox: [16.48, 80.58, 16.58, 80.70],
    active: true
  },
  {
    slug: 'nashik',
    name: 'Nashik',
    state: 'Maharashtra',
    bbox: [19.95, 73.72, 20.05, 73.85],
    active: true
  },
  {
    slug: 'rajkot',
    name: 'Rajkot',
    state: 'Gujarat',
    bbox: [22.25, 70.75, 22.35, 70.85],
    active: true
  },
  {
    slug: 'kanpur',
    name: 'Kanpur',
    state: 'Uttar Pradesh',
    bbox: [26.40, 80.28, 26.52, 80.40],
    active: true
  },
  {
    slug: 'madurai',
    name: 'Madurai',
    state: 'Tamil Nadu',
    bbox: [9.88, 78.08, 9.98, 78.18],
    active: true
  },
  {
    slug: 'varanasi',
    name: 'Varanasi',
    state: 'Uttar Pradesh',
    bbox: [25.28, 82.95, 25.38, 83.05],
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
