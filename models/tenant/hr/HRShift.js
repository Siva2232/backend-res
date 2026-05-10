const mongoose = require('mongoose');

const hrShiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['morning', 'evening', 'night', 'custom'],
      default: 'morning',
    },
    startTime: { type: String, required: true }, // "HH:MM"
    endTime: { type: String, required: true },   // "HH:MM"
    description: { type: String },
    assignedStaff: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'HRStaff' },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);


module.exports = mongoose.model('HRShift', hrShiftSchema);
