const mongoose = require('mongoose');

const applicationEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: ''
    }
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
      index: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true
    },
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      default: 'Unspecified',
      trim: true
    },
    city: {
      type: String,
      default: null,
      trim: true
    },
    applyUrl: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: [
        'discovered',
        'shortlisted',
        'resume_ready',
        'awaiting_approval',
        'applied',
        'assessment',
        'interview',
        'offer',
        'rejected',
        'withdrawn'
      ],
      default: 'shortlisted',
      index: true
    },
    matchScore: {
      type: Number,
      default: null
    },
    tailoredResumeSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    resumeSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    screeningAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    prefilledData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    submissionMethod: {
      type: String,
      default: 'manual'
    },
    submissionMode: {
      type: String,
      default: 'manual'
    },
    submissionResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    confirmationNumber: {
      type: String,
      default: null,
      trim: true
    },
    appliedAt: {
      type: Date,
      default: null
    },
    events: {
      type: [applicationEventSchema],
      default: []
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true, partialFilterExpression: { jobId: { $type: "objectId" } } });
applicationSchema.index({ userId: 1, status: 1 });
applicationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Application', applicationSchema);

