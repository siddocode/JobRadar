const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

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
async function startServer() {
  try {
    const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log(`[Server] Connecting to MongoDB: ${maskedUri}`);

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('[Server] MongoDB connected successfully.');

    app.listen(PORT, () => {
      console.log(`[Server] JobRadar API running on http://localhost:${PORT}`);
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

startServer();

module.exports = app;
