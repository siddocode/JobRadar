const mongoose = require('mongoose');

const techEvidenceSchema = new mongoose.Schema(
  {
    what: { type: String, required: true },
    sourceUrl: { type: String, required: true }
  },
  { _id: false }
);

const contactItemSchema = new mongoose.Schema(
  {
    value: { type: String, required: true },
    sourceUrl: { type: String, required: true }
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    domain: {
      type: String,
      trim: true,
      lowercase: true
    },
    website: {
      type: String,
      default: null,
      trim: true
    },
    category: {
      type: String,
      default: 'Company',
      trim: true
    },
    isTech: {
      type: Boolean,
      default: false
    },
    techEvidence: {
      type: [techEvidenceSchema],
      default: []
    },
    careersUrl: {
      type: String,
      default: null,
      trim: true
    },
    atsType: {
      type: String,
      enum: ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'amazon', 'google', 'custom', null],
      default: null
    },
    atsSlug: {
      type: String,
      default: null,
      trim: true
    },
    contact: {
      emails: {
        type: [contactItemSchema],
        default: []
      },
      phones: {
        type: [contactItemSchema],
        default: []
      },
      contactPageUrl: {
        type: String,
        default: null
      }
    },
    sources: {
      type: [String],
      default: []
    },
    lastVerifiedAt: {
      type: Date,
      default: null
    },
    followUpStatus: {
      type: String,
      enum: ['to_contact', 'contacted', 'replied', 'not_interested', 'none'],
      default: 'to_contact'
    },
    notes: {
      type: String,
      default: ''
    },
    enrichmentStatus: {
      type: String,
      enum: ['pending', 'enriched', 'manual', 'skipped'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

companySchema.index({ domain: 1 }, { unique: true, partialFilterExpression: { domain: { $type: "string" } } });
companySchema.index({ slug: 1 });
companySchema.index({ name: 1 });
companySchema.index({ isTech: 1 });
companySchema.index({ followUpStatus: 1 });

module.exports = mongoose.model('Company', companySchema);
