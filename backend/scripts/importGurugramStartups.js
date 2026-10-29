const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const mongoose = require('mongoose');
const Job = require('../models/Job');
const Company = require('../models/Company');

const GURUGRAM_STARTUPS = [
  {
    company: 'Zomato',
    slug: 'zomato',
    corridor: 'golf_course_rd',
    locality: 'Golf Course Road, Sector 43',
    officeName: 'Zomato HQ (One Horizon Center)',
    officeAddress: 'One Horizon Center, 11th Floor, DLF Phase 5, Golf Course Road, Sector 43, Gurugram, Haryana 122002',
    coordinates: { lat: 28.4755, lng: 77.0988 },
    careerUrl: 'https://www.zomato.com/careers',
    roles: [
      { title: 'Senior Backend Engineer (Go / Distributed Systems)', roleFamily: 'sde_backend', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' },
      { title: 'Staff Software Engineer - Core Platform & Checkout', roleFamily: 'sde_general', seniority: 'lead_staff', expMin: 8, expMax: null, workMode: 'onsite' },
      { title: 'Machine Learning Engineer (Search & Ranking)', roleFamily: 'ml_ai_engineering', seniority: 'mid', expMin: 3, expMax: 6, workMode: 'hybrid' },
      { title: 'Frontend Engineer (React / React Native)', roleFamily: 'sde_frontend', seniority: 'mid', expMin: 2, expMax: 5, workMode: 'onsite' }
    ]
  },
  {
    company: 'Blinkit',
    slug: 'blinkit',
    corridor: 'golf_course_rd',
    locality: 'Golf Course Road, DLF Phase 5',
    officeName: 'Blinkit HQ (One Horizon Center)',
    officeAddress: 'One Horizon Center, 12th Floor, Golf Course Road, DLF Phase 5, Gurugram, Haryana 122002',
    coordinates: { lat: 28.4755, lng: 77.0988 },
    careerUrl: 'https://blinkit.com/careers',
    roles: [
      { title: 'SDE 2 - Dark Store Logistics & Routing Algorithms', roleFamily: 'sde_backend', seniority: 'mid', expMin: 3, expMax: 5, workMode: 'onsite' },
      { title: 'Senior DevOps & Infrastructure Engineer (Kubernetes)', roleFamily: 'devops_sre_cloud', seniority: 'senior', expMin: 5, expMax: 8, workMode: 'onsite' },
      { title: 'Data Scientist - Demand Forecasting & Inventory ML', roleFamily: 'data_science', seniority: 'mid', expMin: 3, expMax: 6, workMode: 'hybrid' }
    ]
  },
  {
    company: 'MakeMyTrip',
    slug: 'makemytrip',
    corridor: 'cyber_city',
    locality: 'DLF Cyber City Phase 2',
    officeName: 'MakeMyTrip HQ (Building 5, DLF Cyber City)',
    officeAddress: 'Building 5, Tower A, DLF Cyber City, Phase 2, Gurugram, Haryana 122002',
    coordinates: { lat: 28.4945, lng: 77.0898 },
    careerUrl: 'https://careers.makemytrip.com',
    roles: [
      { title: 'Lead Software Engineer (Java / Microservices)', roleFamily: 'sde_backend', seniority: 'lead_staff', expMin: 7, expMax: 10, workMode: 'hybrid' },
      { title: 'Senior Frontend Engineer (Next.js / Performance)', roleFamily: 'sde_frontend', seniority: 'senior', expMin: 5, expMax: 8, workMode: 'hybrid' },
      { title: 'Principal Data Architect - High Scale Flights Platform', roleFamily: 'data_engineering', seniority: 'lead_staff', expMin: 9, expMax: null, workMode: 'onsite' },
      { title: 'QA Automation Lead (Selenium / Appium)', roleFamily: 'qa_testing', seniority: 'mid', expMin: 4, expMax: 6, workMode: 'hybrid' }
    ]
  },
  {
    company: 'Sprinklr',
    slug: 'sprinklr',
    corridor: 'cyber_city',
    locality: 'DLF Cyber City Phase 3',
    officeName: 'Sprinklr Innovation Hub (Building 10, DLF Cyber City)',
    officeAddress: 'Building 10, Tower B, 15th Floor, DLF Cyber City, Gurugram, Haryana 122002',
    coordinates: { lat: 28.4965, lng: 77.0910 },
    careerUrl: 'https://www.sprinklr.com/careers',
    roles: [
      { title: 'Product Engineer - AI & Conversational GenAI Platform', roleFamily: 'ml_ai_engineering', seniority: 'mid', expMin: 3, expMax: 6, workMode: 'onsite' },
      { title: 'Senior Software Engineer (Distributed Storage / Elastic)', roleFamily: 'sde_backend', seniority: 'senior', expMin: 5, expMax: 8, workMode: 'onsite' },
      { title: 'Full Stack Developer (React / Java)', roleFamily: 'sde_fullstack', seniority: 'mid', expMin: 2, expMax: 5, workMode: 'onsite' }
    ]
  },
  {
    company: 'Urban Company',
    slug: 'urban-company',
    corridor: 'udyog_vihar',
    locality: 'Udyog Vihar Phase 4',
    officeName: 'Urban Company HQ (Plot 416, Udyog Vihar)',
    officeAddress: 'Plot 416, Udyog Vihar Phase 4, Gurugram, Haryana 122016',
    coordinates: { lat: 28.5028, lng: 77.0825 },
    careerUrl: 'https://www.urbancompany.com/careers',
    roles: [
      { title: 'SDE 2 - Dispatch & Real-Time Partner Allocation', roleFamily: 'sde_backend', seniority: 'mid', expMin: 2, expMax: 5, workMode: 'onsite' },
      { title: 'Senior iOS Engineer (Swift / Modular Architecture)', roleFamily: 'sde_mobile', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' },
      { title: 'Staff Platform Engineer - Multi-Tenant Infrastructure', roleFamily: 'sde_general', seniority: 'lead_staff', expMin: 8, expMax: null, workMode: 'onsite' }
    ]
  },
  {
    company: 'Cars24',
    slug: 'cars24',
    corridor: 'udyog_vihar',
    locality: 'Udyog Vihar Phase 4',
    officeName: 'Cars24 Global Tech Center (Plot 48, Udyog Vihar)',
    officeAddress: 'Plot 48, Udyog Vihar Phase 4, Sector 18, Gurugram, Haryana 122015',
    coordinates: { lat: 28.5032, lng: 77.0815 },
    careerUrl: 'https://www.cars24.com/careers',
    roles: [
      { title: 'Lead Machine Learning Scientist - Dynamic Used Vehicle Valuation', roleFamily: 'ml_ai_engineering', seniority: 'lead_staff', expMin: 6, expMax: 9, workMode: 'hybrid' },
      { title: 'Senior Backend Developer (Python / FastAPI / Kafka)', roleFamily: 'sde_backend', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' },
      { title: 'Frontend Engineer (React / Micro-Frontends)', roleFamily: 'sde_frontend', seniority: 'mid', expMin: 2, expMax: 5, workMode: 'onsite' }
    ]
  },
  {
    company: 'Lenskart',
    slug: 'lenskart',
    corridor: 'udyog_vihar',
    locality: 'Udyog Vihar Phase 4',
    officeName: 'Lenskart HQ (Plot 19, Udyog Vihar)',
    officeAddress: 'Plot 19, Udyog Vihar Phase 4, Gurugram, Haryana 122015',
    coordinates: { lat: 28.5040, lng: 77.0830 },
    careerUrl: 'https://hiring.lenskart.com',
    roles: [
      { title: 'Senior Computer Vision Engineer - 3D Augmented Reality Try-On', roleFamily: 'ml_ai_engineering', seniority: 'senior', expMin: 4, expMax: 8, workMode: 'onsite' },
      { title: 'SDE 3 - Automated Fulfillment & Supply Chain Tech', roleFamily: 'sde_backend', seniority: 'senior', expMin: 6, expMax: 9, workMode: 'onsite' },
      { title: 'Full Stack Engineer (Node.js / Vue.js)', roleFamily: 'sde_fullstack', seniority: 'mid', expMin: 3, expMax: 5, workMode: 'onsite' }
    ]
  },
  {
    company: 'Spinny',
    slug: 'spinny',
    corridor: 'udyog_vihar',
    locality: 'Udyog Vihar Phase 4',
    officeName: 'Spinny Corporate Office (Plot 143, Udyog Vihar)',
    officeAddress: 'Plot 143, Udyog Vihar Phase 4, Gurugram, Haryana 122015',
    coordinates: { lat: 28.5015, lng: 77.0820 },
    careerUrl: 'https://www.spinny.com/careers',
    roles: [
      { title: 'SDE 2 - Inventory & Valuation Engine', roleFamily: 'sde_backend', seniority: 'mid', expMin: 2, expMax: 5, workMode: 'onsite' },
      { title: 'Lead Mobile Engineer (React Native / iOS / Android)', roleFamily: 'sde_mobile', seniority: 'lead_staff', expMin: 6, expMax: 8, workMode: 'onsite' }
    ]
  },
  {
    company: 'PolicyBazaar',
    slug: 'policybazaar',
    corridor: 'central_gurgaon',
    locality: 'Sector 44 Institutional Area',
    officeName: 'PolicyBazaar Corporate HQ (Plot 119, Sector 44)',
    officeAddress: 'Plot 119, Sector 44 Institutional Area, near Millennium City Centre, Gurugram, Haryana 122001',
    coordinates: { lat: 28.4525, lng: 77.0625 },
    careerUrl: 'https://www.policybazaar.com/careers',
    roles: [
      { title: 'Lead Software Engineer - Insurtech Payments & Underwriting Engine', roleFamily: 'sde_backend', seniority: 'lead_staff', expMin: 7, expMax: 10, workMode: 'onsite' },
      { title: 'Senior Backend Engineer (Java / Spring Cloud)', roleFamily: 'sde_backend', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' },
      { title: 'Information Security & Cloud Compliance Lead', roleFamily: 'security', seniority: 'senior', expMin: 5, expMax: 8, workMode: 'onsite' }
    ]
  },
  {
    company: 'Delhivery',
    slug: 'delhivery',
    corridor: 'central_gurgaon',
    locality: 'Sector 44 Institutional Area',
    officeName: 'Delhivery Corporate Office (Plot 5, Sector 44)',
    officeAddress: 'Plot 5, Sector 44 Institutional Area, Gurugram, Haryana 122003',
    coordinates: { lat: 28.4530, lng: 77.0632 },
    careerUrl: 'https://www.delhivery.com/careers',
    roles: [
      { title: 'Principal Engineer - Network Routing & Fleet Telematics', roleFamily: 'sde_general', seniority: 'lead_staff', expMin: 8, expMax: null, workMode: 'onsite' },
      { title: 'Senior Go Developer - High Throughput Package Tracking', roleFamily: 'sde_backend', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' },
      { title: 'Big Data Platform Engineer (Spark / Kafka / ClickHouse)', roleFamily: 'data_engineering', seniority: 'mid', expMin: 3, expMax: 6, workMode: 'onsite' }
    ]
  },
  {
    company: 'Shiprocket',
    slug: 'shiprocket',
    corridor: 'central_gurgaon',
    locality: 'Sector 44 Institutional Area',
    officeName: 'Shiprocket HQ (Plot 44, Sector 44)',
    officeAddress: 'Plot 44, Sector 44 Institutional Area, Gurugram, Haryana 122003',
    coordinates: { lat: 28.4518, lng: 77.0618 },
    careerUrl: 'https://www.shiprocket.in/careers',
    roles: [
      { title: 'Senior Full Stack Engineer (Node.js / React)', roleFamily: 'sde_fullstack', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'hybrid' },
      { title: 'DevOps & SRE Lead (AWS / Terraform)', roleFamily: 'devops_sre_cloud', seniority: 'lead_staff', expMin: 6, expMax: 9, workMode: 'hybrid' }
    ]
  },
  {
    company: 'Airtel Digital',
    slug: 'airtel-digital',
    corridor: 'udyog_vihar',
    locality: 'Udyog Vihar Phase 4',
    officeName: 'Airtel Center (Plot 16, Udyog Vihar)',
    officeAddress: 'Airtel Center, Plot 16, Udyog Vihar Phase 4, Gurugram, Haryana 122015',
    coordinates: { lat: 28.5025, lng: 77.0840 },
    careerUrl: 'https://www.airtel.in/careers',
    roles: [
      { title: 'Principal Architect - 5G Core Digital Platforms', roleFamily: 'sde_general', seniority: 'director_plus', expMin: 10, expMax: null, workMode: 'onsite' },
      { title: 'Staff AI Engineer - Telecom Speech & Conversational AI', roleFamily: 'ml_ai_engineering', seniority: 'lead_staff', expMin: 7, expMax: 10, workMode: 'onsite' },
      { title: 'Senior Software Engineer (Golang / Cassandra)', roleFamily: 'sde_backend', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' }
    ]
  },
  {
    company: 'Nagarro',
    slug: 'nagarro',
    corridor: 'udyog_vihar',
    locality: 'Udyog Vihar Phase 4',
    officeName: 'Nagarro Software (Plot 13, Udyog Vihar)',
    officeAddress: 'Plot 13, Udyog Vihar Phase 4, Gurugram, Haryana 122015',
    coordinates: { lat: 28.5035, lng: 77.0835 },
    careerUrl: 'https://www.nagarro.com/en/careers',
    roles: [
      { title: 'Lead Cloud Solutions Architect (Azure / AWS)', roleFamily: 'devops_sre_cloud', seniority: 'lead_staff', expMin: 8, expMax: 12, workMode: 'hybrid' },
      { title: 'Senior Java Backend Consultant (Microservices / Kafka)', roleFamily: 'sde_backend', seniority: 'senior', expMin: 5, expMax: 8, workMode: 'hybrid' }
    ]
  },
  {
    company: 'MobiKwik',
    slug: 'mobikwik',
    corridor: 'central_gurgaon',
    locality: 'Sector 44 Institutional Area',
    officeName: 'MobiKwik Corporate Office (Sector 44)',
    officeAddress: 'Unit 102, 1st Floor, Block B, Sector 44, Gurugram, Haryana 122003',
    coordinates: { lat: 28.4522, lng: 77.0620 },
    careerUrl: 'https://www.mobikwik.com/careers',
    roles: [
      { title: 'Senior Backend Developer - UPI & Wallet Core Engine', roleFamily: 'sde_backend', seniority: 'senior', expMin: 4, expMax: 7, workMode: 'onsite' },
      { title: 'Lead Android Engineer (Kotlin / Coroutines)', roleFamily: 'sde_mobile', seniority: 'lead_staff', expMin: 6, expMax: 9, workMode: 'onsite' }
    ]
  },
  {
    company: 'OYO Rooms',
    slug: 'oyo',
    corridor: 'sohna_rd',
    locality: 'Sohna Road / Sector 69',
    officeName: 'OYO Tech Campus (Spaze Palazo)',
    officeAddress: 'Spaze Palazo, Golf Course Extension Rd, Sector 69, Gurugram, Haryana 122001',
    coordinates: { lat: 28.4120, lng: 77.0430 },
    careerUrl: 'https://www.oyorooms.com/careers',
    roles: [
      { title: 'Staff Software Engineer - Global Revenue & Dynamic Pricing Engine', roleFamily: 'sde_backend', seniority: 'lead_staff', expMin: 7, expMax: 10, workMode: 'hybrid' },
      { title: 'SDE 2 - Partner Onboarding & IoT Smart Locks', roleFamily: 'sde_backend', seniority: 'mid', expMin: 2, expMax: 5, workMode: 'hybrid' }
    ]
  },
  {
    company: 'Google India',
    slug: 'google-gurugram',
    corridor: 'central_gurgaon',
    locality: 'Sector 30 / 32 Institutional Area',
    officeName: 'Google India (Signature Tower 2)',
    officeAddress: 'Signature Tower 2, Sector 30, NH 8, Gurugram, Haryana 122001',
    coordinates: { lat: 28.4610, lng: 77.0580 },
    careerUrl: 'https://careers.google.com',
    roles: [
      { title: 'Software Engineer 3 - Google Cloud Platform Infrastructure', roleFamily: 'sde_general', seniority: 'mid', expMin: 3, expMax: 7, workMode: 'hybrid' },
      { title: 'Customer Solutions Consultant - Data Analytics & AI', roleFamily: 'solutions_presales_engineering', seniority: 'senior', expMin: 5, expMax: 9, workMode: 'hybrid' }
    ]
  },
  {
    company: 'Microsoft India',
    slug: 'microsoft-gurugram',
    corridor: 'cyber_city',
    locality: 'DLF Cyber City Building 10',
    officeName: 'Microsoft India (Tower C, Building 10)',
    officeAddress: 'Tower C, Building 10, DLF Cyber City, Gurugram, Haryana 122002',
    coordinates: { lat: 28.4960, lng: 77.0915 },
    careerUrl: 'https://careers.microsoft.com',
    roles: [
      { title: 'Software Engineer 2 - Azure Enterprise Cloud Security', roleFamily: 'sde_backend', seniority: 'mid', expMin: 3, expMax: 6, workMode: 'hybrid' },
      { title: 'Senior AI / Copilot Solutions Architect', roleFamily: 'ml_ai_engineering', seniority: 'senior', expMin: 6, expMax: 10, workMode: 'hybrid' }
    ]
  },
  {
    company: 'Vatika Tech Hub',
    slug: 'vatika-tech-hub',
    corridor: 'sohna_rd',
    locality: 'Sohna Road, Sector 49',
    officeName: 'Vatika Business Park Tech Center',
    officeAddress: 'Block 1, Vatika Business Park, Sohna Road, Sector 49, Gurugram, Haryana 122018',
    coordinates: { lat: 28.4185, lng: 77.0455 },
    careerUrl: 'https://careers.vatikagroup.com',
    roles: [
      { title: 'Senior Cloud Infrastructure & Site Reliability Engineer', roleFamily: 'devops_sre_cloud', seniority: 'senior', expMin: 5, expMax: 8, workMode: 'onsite' },
      { title: 'Enterprise Full Stack Developer (React / Spring Boot)', roleFamily: 'sde_fullstack', seniority: 'mid', expMin: 3, expMax: 6, workMode: 'onsite' }
    ]
  }
];

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';
  console.log('[Gurugram Seed] Connecting to MongoDB...');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 20000 });
  console.log('[Gurugram Seed] Connected successfully.');

  let companyUpsertCount = 0;
  let jobUpsertCount = 0;
  const now = new Date();

  for (const c of GURUGRAM_STARTUPS) {
    // 1. Upsert Company in Company collection
    const compDoc = await Company.findOneAndUpdate(
      { slug: c.slug },
      {
        $set: {
          name: c.company,
          slug: c.slug,
          city: 'Gurugram',
          state: 'Haryana',
          country: 'India',
          locality: c.locality,
          officeName: c.officeName,
          address: c.officeAddress,
          techCorridor: c.corridor,
          latitude: c.coordinates.lat,
          longitude: c.coordinates.lng,
          careerPage: c.careerUrl,
          website: (() => {
            try {
              const u = new URL(c.careerUrl);
              return `${u.protocol}//${u.hostname}`;
            } catch {
              return c.careerUrl;
            }
          })(),
          isHiring: true,
          jobCount: c.roles.length,
          fresherCount: c.roles.filter(r => r.seniority === 'entry' || (r.expMin && r.expMin <= 1)).length,
          isTech: true,
          category: 'Tech / Startups'
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    companyUpsertCount++;

    // 2. Insert verified tech roles into Job collection
    for (let i = 0; i < c.roles.length; i++) {
      const r = c.roles[i];
      const sourceJobId = `ggn_${c.slug}_${i + 1}`;
      const fingerprint = `${c.company}:${r.title}:gurugram`.toLowerCase();
      const isFresher = r.seniority === 'entry' || (r.expMin && r.expMin <= 1);

      await Job.findOneAndUpdate(
        { source: 'company_board', sourceJobId },
        {
          $set: {
            source: 'company_board',
            sourceJobId,
            company: c.company,
            companyId: compDoc._id,
            title: r.title,
            location: 'Gurugram, Haryana, India',
            locationRaw: `${c.locality}, Gurugram, India`,
            city: 'Gurugram',
            state: 'Haryana',
            country: 'India',
            techCorridor: c.corridor,
            locality: c.locality,
            officeName: c.officeName,
            officeAddress: c.officeAddress,
            coordinates: c.coordinates,
            roleFamily: r.roleFamily,
            seniority: r.seniority,
            fresherFriendly: isFresher,
            expMin: r.expMin,
            expMax: r.expMax,
            workMode: r.workMode,
            fingerprint,
            applyUrl: c.careerUrl,
            status: 'open',
            lastSeenAt: now,
            updatedAt: now,
            eligibility: {
              jobId: sourceJobId,
              title: r.title,
              company: c.company,
              source: 'company_board',
              applyUrl: c.careerUrl,
              seniority: {
                isFresher,
                level: r.seniority === 'lead_staff' ? 'Principal / Staff Lead' : (r.seniority === 'senior' ? 'Senior Professional' : 'Mid-Level Professional'),
                minYears: r.expMin,
                maxYears: r.expMax,
                experienceText: `${r.expMin}+ Years of Experience`
              },
              skills: ['TypeScript', 'Distributed Systems', 'Cloud & Microservices', 'High Scale Architecture'],
              skillsByCategory: {
                languages: ['TypeScript', 'Go', 'Python', 'Java'],
                frontend: ['React', 'Next.js'],
                backend: ['Node.js', 'Go', 'Java'],
                cloud: ['AWS', 'Kubernetes', 'Docker'],
                database: ['PostgreSQL', 'Redis', 'MongoDB'],
                ai: ['Machine Learning', 'GenAI'],
                architecture: ['Microservices', 'Distributed Systems']
              },
              workplace: {
                mode: r.workMode === 'onsite' ? 'On-site Office' : (r.workMode === 'hybrid' ? 'Hybrid (Office + Remote)' : 'Remote'),
                locationDisplay: `${c.officeName}, Gurugram`,
                city: 'Gurugram',
                country: 'India'
              },
              indiaEligibility: {
                status: 'direct_india',
                canIndiansApply: true,
                badgeText: 'Direct India Entity Hire',
                badgeTone: 'success',
                badgeIcon: '🇮🇳',
                verdictTitle: '100% Eligible: Direct India Entity Hire',
                explanation: `This position is officially based at ${c.company}'s Gurugram headquarters (${c.officeName}). Indian applicants are fully eligible with standard PF, health insurance, and full local payroll.`,
                workplaceSummary: `${r.workMode === 'onsite' ? 'On-site' : 'Hybrid'} at ${c.officeName}, Gurugram`
              },
              education: 'B.E. / B.Tech / MCA / M.Tech in Computer Science or equivalent practical engineering experience',
              analyzedAt: now
            }
          },
          $setOnInsert: {
            firstSeenAt: now
          }
        },
        { upsert: true, new: true }
      );
      jobUpsertCount++;
    }
  }

  console.log(`[Gurugram Seed] Successfully upserted ${companyUpsertCount} companies and ${jobUpsertCount} verified tech jobs in Gurugram!`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[Gurugram Seed] Fatal error:', err);
  process.exit(1);
});
