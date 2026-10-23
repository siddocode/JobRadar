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
const jobController = require('./controllers/jobController');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobradar';

// Middleware
app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api/jobs', jobRoutes);
app.use('/api/directory', directoryRoutes);
app.get('/api/cities', jobController.getCities);
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
  const enableCron = process.env.ENABLE_CRON === 'true';
  const cronSchedule = process.env.CRON_SCHEDULE || '0 */6 * * *';

  if (enableCron) {
    try {
      const cron = require('node-cron');
      const { runCollection } = require('./scripts/collect');

      console.log(`[Scheduler] In-app cron scheduler enabled with schedule: "${cronSchedule}"`);
      cron.schedule(cronSchedule, async () => {
        console.log(`[Scheduler] Starting scheduled job collection at ${new Date().toISOString()}...`);
        try {
          const summary = await runCollection();
          console.log(`[Scheduler] Scheduled collection complete: ${summary.totalUpserted} upserted, ${summary.totalClosed} closed.`);
        } catch (err) {
          console.error('[Scheduler] Scheduled collection error:', err.message);
        }
      });
    } catch (err) {
      console.error('[Scheduler] Failed to initialize in-app cron:', err.message);
    }
  } else {
    console.log('[Scheduler] In-app cron is idle (Enable via ENABLE_CRON=true in backend/.env if running always-on).');
  }
}

startServer();

module.exports = app;

