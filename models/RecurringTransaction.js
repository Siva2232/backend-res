const mongoose = require("mongoose");

const recurringTransactionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    transactionType: { type: String, enum: ["expense", "income"], required: true },
    amount: { type: Number, required: true, min: 0 },
    debitLedger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    creditLedger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "AccountCategory", default: null },
    note: { type: String, default: "" },
    frequency: { type: String, enum: ["daily", "weekly", "monthly"], default: "monthly" },
    dayOfMonth: { type: Number, default: 1, min: 1, max: 28 }, // for monthly
    isActive: { type: Boolean, default: true },
    lastRunDate: { type: Date, default: null },
    nextRunDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RecurringTransaction", recurringTransactionSchema);
