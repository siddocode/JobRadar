const mongoose = require('mongoose');

const sourceRunSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      default: 'greenhouse'
    },
    company: {
      type: String,
      required: true
    },
    slug: {
      type: String,
      default: ''
    },
    // Retained for backward compatibility
    greenhouseSlug: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true
    },
    jobsFetched: {
      type: Number,
      default: 0
    },
    jobsUpserted: {
      type: Number,
      default: 0
    },
    jobsClosed: {
      type: Number,
      default: 0
    },
    durationMs: {
      type: Number,
      default: 0
    },
    errorMessage: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

sourceRunSchema.index({ source: 1, slug: 1, createdAt: -1 });

module.exports = mongoose.model('SourceRun', sourceRunSchema);
