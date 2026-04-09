const mongoose = require('mongoose');

const accExpenseSchema = new mongoose.Schema(
  {
    expenseNo: { type: String },
    date: { type: Date, default: Date.now },
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'AccParty' }, // vendor / employee
    category: {
      type: String,
      enum: ['Salary', 'Rent', 'Utilities', 'Purchase Cost', 'Other Expenses', 'Taxes'],
      required: true,
    },
    description: { type: String },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['Paid', 'Partial', 'Unpaid'], default: 'Unpaid' },
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Split', ''], default: '' },
    notes: { type: String },
    ledgerEntries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AccLedgerEntry' }],
  },
  { timestamps: true }
);

accExpenseSchema.pre('save', async function () {
  if (this.isNew && !this.expenseNo) {
    const last = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
    const num = last ? parseInt(last.expenseNo?.replace('EX-', '') || 0) + 1 : 1;
    this.expenseNo = `EX-${String(num).padStart(4, '0')}`;
  }
});


module.exports = mongoose.model('AccExpense', accExpenseSchema);
