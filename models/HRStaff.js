const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const hrStaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ['admin', 'manager', 'staff'],
      default: 'staff',
    },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    joiningDate: { type: Date },
    status: {
      type: String,
      enum: ['active', 'inactive', 'terminated'],
      default: 'active',
    },
    baseSalary: { type: Number, default: 0 },
    address: { type: String },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    dateOfBirth: { type: Date },
    emergencyContact: { type: String },
    documents: [documentSchema],
    avatar: { type: String },
    // Shift assignment stored here for quick lookup
    currentShift: { type: mongoose.Schema.Types.ObjectId, ref: 'HRShift' },
  },
  { timestamps: true }
);

hrStaffSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

hrStaffSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('HRStaff', hrStaffSchema);
