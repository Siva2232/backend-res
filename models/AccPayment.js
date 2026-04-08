const mongoose = require('mongoose');

const accPaymentSchema = new mongoose.Schema(
  {
    paymentNo: { type: String },
    date: { type: Date, default: Date.now },
    refModel: {
      type: String,
      enum: ['AccOrder', 'AccPurchase', 'AccExpense', 'AccLoan'],
      required: true,
    },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'AccParty' },
    amount: { type: Number, required: true },
    mode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Split'], default: 'Cash' },
    notes: { type: String },
    ledgerEntries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AccLedgerEntry' }],
  },
  { timestamps: true }
);

accPaymentSchema.pre('save', async function () {
  if (this.isNew && !this.paymentNo) {
    const last = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
    const num = last ? parseInt(last.paymentNo?.replace('PAY-', '') || 0) + 1 : 1;
    this.paymentNo = `PAY-${String(num).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('AccPayment', accPaymentSchema);
