const mongoose = require('mongoose');

const hrLeaveSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HRStaff',
      required: true,
    },
    type: {
      type: String,
      enum: ['sick', 'casual', 'annual', 'unpaid', 'other'],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HRStaff' },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
  },
  { timestamps: true }
);

// Auto-calculate total days before save
hrLeaveSchema.pre('save', function () {
  if (this.startDate && this.endDate) {
    const diffMs = this.endDate - this.startDate;
    this.totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }
});

module.exports = mongoose.model('HRLeave', hrLeaveSchema);
