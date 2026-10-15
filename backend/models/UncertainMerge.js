const mongoose = require('mongoose');

const uncertainMergeSchema = new mongoose.Schema(
  {
    companyA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    companyB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    similarityScore: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['pending', 'merged', 'dismissed'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

uncertainMergeSchema.index({ status: 1 });

module.exports = mongoose.model('UncertainMerge', uncertainMergeSchema);
