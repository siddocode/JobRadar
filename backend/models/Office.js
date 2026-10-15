const mongoose = require('mongoose');

const officeSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true
    },
    address: {
      type: String,
      default: '',
      trim: true
    },
    locality: {
      type: String,
      default: '',
      trim: true
    },
    lat: {
      type: Number,
      default: null
    },
    lng: {
      type: Number,
      default: null
    },
    addressSource: {
      type: String,
      required: true,
      trim: true
    },
    addressType: {
      type: String,
      enum: ['registered', 'development', 'unknown'],
      default: 'unknown'
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

officeSchema.index({ companyId: 1, cityId: 1 });
officeSchema.index({ companyId: 1, lat: 1, lng: 1 });

module.exports = mongoose.model('Office', officeSchema);
