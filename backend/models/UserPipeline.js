const mongoose = require('mongoose');

const userPipelineSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    followUpStatus: {
      type: String,
      enum: ['to_contact', 'contacted', 'replied', 'not_interested', 'none'],
      default: 'to_contact'
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

userPipelineSchema.index({ userId: 1, companyId: 1 }, { unique: true });
userPipelineSchema.index({ userId: 1, followUpStatus: 1 });

module.exports = mongoose.model('UserPipeline', userPipelineSchema);
