const mongoose = require('mongoose');

const citySchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    // [south, west, north, east]
    bbox: {
      type: [Number],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length === 4;
        },
        message: 'Bbox must contain exactly 4 coordinates: [south, west, north, east]'
      }
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

citySchema.index({ active: 1 });

module.exports = mongoose.model('City', citySchema);
