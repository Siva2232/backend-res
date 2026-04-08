const mongoose = require('mongoose');

// Double-entry ledger entry
const accLedgerEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'AccAccount', required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: { type: String },
    // grouping key so we can fetch both sides of one transaction together
    txnId: { type: String, index: true },
    // which source document generated this entry
    refModel: {
      type: String,
      enum: ['AccOrder', 'AccPurchase', 'AccExpense', 'AccLoan', 'AccPayment', 'Manual'],
    },
    refId: { type: mongoose.Schema.Types.ObjectId },
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'AccParty' },
  },
  { timestamps: true }
);

accLedgerEntrySchema.index({ txnId: 1 });
accLedgerEntrySchema.index({ account: 1 });

module.exports = mongoose.model('AccLedgerEntry', accLedgerEntrySchema);
