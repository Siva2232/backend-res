const mongoose = require('mongoose');

const hrAttendanceSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HRStaff',
      required: true,
    },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'leave', 'half-day', 'holiday'],
      default: 'present',
    },
    checkIn: { type: String }, // stored as "HH:MM"
    checkOut: { type: String },
    workHours: { type: Number, default: 0 },
    selfie: { type: String }, // path to selfie image
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    note: { type: String },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HRStaff' },
  },
  { timestamps: true }
);

// Prevent duplicate attendance entry per staff per day
hrAttendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('HRAttendance', hrAttendanceSchema);
