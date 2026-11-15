const mongoose = require('mongoose');

const autopilotActionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      default: null
    },
    jobTitle: {
      type: String,
      default: ''
    },
    companyName: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['matched', 'skipped', 'prepared', 'submitted', 'blocked', 'failed'],
      required: true
    },
    reason: {
      type: String,
      default: ''
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const autopilotRunSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    finishedAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed', 'paused'],
      default: 'running'
    },
    jobsEvaluated: {
      type: Number,
      default: 0
    },
    applicationsCreated: {
      type: Number,
      default: 0
    },
    applicationsSubmitted: {
      type: Number,
      default: 0
    },
    actions: {
      type: [autopilotActionSchema],
      default: []
    },
    error: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

autopilotRunSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AutopilotRun', autopilotRunSchema);

