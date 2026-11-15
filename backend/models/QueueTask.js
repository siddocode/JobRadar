const mongoose = require('mongoose');

const queueTaskSchema = new mongoose.Schema(
  {
    taskType: {
      type: String,
      required: true,
      enum: ['job_ingestion', 'match_evaluation', 'autopilot_execution', 'portal_scan', 'sync_company'],
      index: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true
    },
    priority: {
      type: Number,
      default: 0,
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    lastError: {
      type: String,
      default: null
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
      index: true
    },
    startedAt: {
      type: Date,
      default: null
    },
    finishedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

queueTaskSchema.index({ status: 1, scheduledFor: 1, priority: -1 });

module.exports = mongoose.model('QueueTask', queueTaskSchema);

