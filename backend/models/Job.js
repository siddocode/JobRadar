const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      default: 'greenhouse',
      trim: true
    },
    sourceJobId: {
      type: String,
      required: true,
      trim: true
    },
    company: {
      type: String,
      required: true,
      trim: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    // Backwards compatibility / display string
    location: {
      type: String,
      default: 'Unspecified',
      trim: true
    },
    // Normalized location fields
    locationRaw: {
      type: String,
      default: 'Unspecified',
      trim: true
    },
    city: {
      type: String,
      default: null,
      trim: true
    },
    state: {
      type: String,
      default: null,
      trim: true
    },
    country: {
      type: String,
      default: null,
      trim: true
    },
    workMode: {
      type: String,
      enum: ['onsite', 'hybrid', 'remote', 'unknown'],
      default: 'unknown'
    },
    // Deduplication fingerprint: normalized(company + title + city)
    fingerprint: {
      type: String,
      trim: true,
      index: true
    },
    descriptionHtml: {
      type: String,
      default: ''
    },
    applyUrl: {
      type: String,
      required: true,
      trim: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    firstSeenAt: {
      type: Date,
      default: Date.now
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open'
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index on (source, sourceJobId)
jobSchema.index({ source: 1, sourceJobId: 1 }, { unique: true });

// Additional indexing for filtering and search performance
jobSchema.index({ status: 1, lastSeenAt: -1 });
jobSchema.index({ company: 1, status: 1 });
jobSchema.index({ companyId: 1, status: 1 });
jobSchema.index({ city: 1, status: 1 });
jobSchema.index({ country: 1, status: 1 });
jobSchema.index({ workMode: 1, status: 1 });
jobSchema.index({ fingerprint: 1, status: 1 });

module.exports = mongoose.model('Job', jobSchema);

