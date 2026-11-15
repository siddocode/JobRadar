const mongoose = require('mongoose');

const autopilotConfigSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    enabled: {
      type: Boolean,
      default: false
    },
    mode: {
      type: String,
      enum: ['assisted', 'autonomous'],
      default: 'assisted'
    },
    targetRoles: {
      type: [String],
      default: ['Software Engineer', 'Full Stack Developer', 'Backend Engineer', 'Frontend Engineer']
    },
    preferredLocations: {
      type: [String],
      default: ['All India']
    },
    workModes: {
      type: [String],
      default: ['remote', 'hybrid', 'onsite']
    },
    minMatchScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100
    },
    dailyLimit: {
      type: Number,
      default: 5,
      min: 1,
      max: 50
    },
    blacklistedCompanies: {
      type: [String],
      default: []
    },
    autoTailorResume: {
      type: Boolean,
      default: true
    },
    notifyOnSubmission: {
      type: Boolean,
      default: true
    },
    lastRunAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('AutopilotConfig', autopilotConfigSchema);

