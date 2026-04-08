const mongoose = require('mongoose');

const accLoanSchema = new mongoose.Schema(
  {
    loanNo: { type: String },
    date: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: [
        'LoanTaken',
        'LoanRepayment',
        'CapitalInjection',
        'VendorAdvance',
        'EmployeeAdvance',
        'CustomerAdvance',
      ],
      required: true,
    },
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'AccParty' },
    amount: { type: Number, required: true },
    description: { type: String },
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Split', ''], default: 'Cash' },
    notes: { type: String },
    ledgerEntries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AccLedgerEntry' }],
  },
  { timestamps: true }
);

accLoanSchema.pre('save', async function () {
  if (this.isNew && !this.loanNo) {
    const last = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
    const num = last ? parseInt(last.loanNo?.replace('LN-', '') || 0) + 1 : 1;
    this.loanNo = `LN-${String(num).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('AccLoan', accLoanSchema);
