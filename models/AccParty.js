const mongoose = require('mongoose');

const accPartySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Customer', 'Supplier', 'Vendor', 'Employee', 'Both', 'Other'],
      default: 'Customer',
    },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String },
    gstin: { type: String, trim: true },
    openingBalance: { type: Number, default: 0 }, // positive = they owe us
    balance: { type: Number, default: 0 },        // running balance (receivable positive, payable negative)
    notes: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AccParty', accPartySchema);
