const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const jobRoutes = require('./routes/jobRoutes');
const directoryRoutes = require('./routes/directoryRoutes');
const authRoutes = require('./routes/authRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const autopilotRoutes = require('./routes/autopilotRoutes');
const jobController = require('./controllers/jobController');

const cookieParser = require('cookie-parser');
const { generalApiLimiter } = require('./utils/rateLimiter');
const securityHeaders = require('./middleware/securityHeaders');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';

// Disable X-Powered-By fingerprint
app.disable('x-powered-by');

// Trust reverse proxy (Render / Cloudflare) for HTTPS cookie handling
app.set('trust proxy', 1);

// Mount HTTP Security Headers
app.use(securityHeaders);

// Allowed origins logic: In production, enforce whitelist (Vercel domains, APP_URL, localhost)
const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  process.env.APP_URL
].filter(Boolean);

const corsOriginDelegate = (origin, callback) => {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
  if (!origin) return callback(null, true);

  if (!isProd) {
    return callback(null, true);
  }

  // Production check: explicit whitelist or *.vercel.app domain
  const isAllowed = allowedOrigins.includes(origin) || /^https:\/\/.*\.vercel\.app$/.test(origin);
  if (isAllowed) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};

// Middleware & CORS configuration for cross-domain requests (Vercel <-> Render)
const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Root endpoint (verifies API is online when opening Render URL directly in browser)
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'JobRadar API',
    status: 'online',
    health: '/api/health',
    timestamp: new Date().toISOString()
  });
});

// Apply general API rate limiting to all /api endpoints
app.use('/api', generalApiLimiter);

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/autopilot', autopilotRoutes);
app.get('/api/cities', jobController.getCities);
app.get('/api/corridors', jobController.getCorridors);
app.get('/api/countries', jobController.getCountries);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.status(200).json({
    status: 'ok',
    database: states[dbState] || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// Database connection & Server initialization
async function connectWithRetry(maxAttempts = 3) {
  const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`[Server] Connecting to MongoDB: ${maskedUri}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Server] Retrying MongoDB connection (attempt ${attempt}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 20000,
        family: 4
      });
      console.log('[Server] MongoDB connected successfully.');
      return true;
    } catch (err) {
      console.warn(`[Server] Connection attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxAttempts) throw err;
    }
  }
}

async function startServer() {
  try {
    await connectWithRetry(3);

    const { startQueueWorker } = require('./services/jobQueue');
    startQueueWorker(5000);

    app.listen(PORT, () => {
      console.log(`[Server] JobRadar API running on http://localhost:${PORT}`);
      setupCronScheduler();
    });
  } catch (error) {
    console.error('[Server] Fatal MongoDB connection error:', error.message);
    console.log('[Server] Note: Verify MONGODB_URI in backend/.env');
    // Start HTTP server anyway so health endpoint can report database disconnection
    app.listen(PORT, () => {
      console.log(`[Server] JobRadar API running in degraded state on http://localhost:${PORT}`);
    });
  }
}

// In-App Background Cron Scheduler
function setupCronScheduler() {
  const enableCron = process.env.ENABLE_CRON !== 'false'; // Enabled by default for autonomous live operation
  const cronSchedule = process.env.CRON_SCHEDULE || '0 */6 * * *';

  if (enableCron) {
    try {
      const cron = require('node-cron');
      const { runCollection } = require('./scripts/collect');
      const { harvestAllMajorHubs } = require('./services/autoJobHarvester');
      const { runScheduledAutopilotBatch } = require('./controllers/autopilotController');
      const { runMaintenanceCleanup } = require('./services/jobQueue');

      console.log(`[Scheduler] Autonomous 100% Free Job Harvester active (Schedule: "${cronSchedule}")`);
      cron.schedule(cronSchedule, async () => {
        console.log(`[Scheduler] Starting recurring automated harvest at ${new Date().toISOString()}...`);
        try {
          // 1. Run free public ATS startup harvester across Indian tech capitals
          await harvestAllMajorHubs();
          // 2. Run board sync
          const summary = await runCollection();
          console.log(`[Scheduler] Automated sync complete: ${summary.totalUpserted} upserted, ${summary.totalClosed} closed.`);
          // 3. Run scheduled autopilot screening & preparation for active subscribers
          await runScheduledAutopilotBatch();
          // 4. Safe 90-day job archival and old queue task cleanup without deleting application history
          const cleanupResult = await runMaintenanceCleanup({ jobRetentionDays: 90, taskRetentionDays: 7 });
          console.log(`[Scheduler] Maintenance cleanup complete: ${cleanupResult.jobsArchived} jobs archived, ${cleanupResult.tasksCleaned} queue tasks cleaned.`);
        } catch (err) {
          console.error('[Scheduler] Automated sync error:', err.message);
        }
      });
    } catch (err) {
      console.error('[Scheduler] Failed to initialize in-app cron:', err.message);
    }
  } else {
    console.log('[Scheduler] In-app cron is disabled.');
  }
}

startServer();

module.exports = app;

