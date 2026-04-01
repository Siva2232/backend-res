const mongoose = require('mongoose');

const hrPayrollSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HRStaff',
      required: true,
    },
    month: { type: Number, required: true, min: 1, max: 12 }, // 1-12
    year: { type: Number, required: true },
    baseSalary: { type: Number, required: true, default: 0 },
    workingDays: { type: Number, default: 26 }, // calendar working days
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    leaveDeduction: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },   // overtime pay amount
    netSalary: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
    paidAt: { type: Date },
    payslipSent: { type: Boolean, default: false },
    payslipSentAt: { type: Date },
    notes: { type: String },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HRStaff' },
  },
  { timestamps: true }
);

// Prevent duplicate payroll per staff per month/year
hrPayrollSchema.index({ staff: 1, month: 1, year: 1 }, { unique: true });

// Auto-calculate net salary before save
hrPayrollSchema.pre('save', async function () {
  this.netSalary =
    this.baseSalary -
    this.leaveDeduction +
    this.bonus +
    this.overtime;
  if (this.netSalary < 0) this.netSalary = 0;
});

hrPayrollSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();
  
  // If we are doing a regular update (not with $set)
  if (update.baseSalary !== undefined || update.leaveDeduction !== undefined || update.bonus !== undefined || update.overtime !== undefined) {
    const baseSalary = update.baseSalary ?? 0;
    const leaveDeduction = update.leaveDeduction ?? 0;
    const bonus = update.bonus ?? 0;
    const overtime = update.overtime ?? 0;
    
    update.netSalary = Math.max(0, baseSalary - leaveDeduction + bonus + overtime);
  } 
  // If we are using $set
  else if (update.$set) {
    // We need the existing document to calculate correctly if only some fields are updated
    // But for upsert/generate, hrPayrollController passes all fields
    const u = update.$set;
    if (u.baseSalary !== undefined || u.leaveDeduction !== undefined || u.bonus !== undefined || u.overtime !== undefined) {
       // Controller-specific optimization: handle cases where controller sends all 4
       if (u.baseSalary !== undefined && u.leaveDeduction !== undefined && u.bonus !== undefined && u.overtime !== undefined) {
          u.netSalary = Math.max(0, u.baseSalary - u.leaveDeduction + u.bonus + u.overtime);
       }
    }
  }
});

module.exports = mongoose.model('HRPayroll', hrPayrollSchema);
