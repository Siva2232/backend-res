const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["asset", "liability", "income", "expense"],
      required: true,
    },
    group: { type: String, default: "" }, // e.g. "Cash & Bank", "Direct Expense"
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    description: { type: String, default: "" },
    isSystem: { type: Boolean, default: false }, // system ledgers cannot be deleted
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ledger", ledgerSchema);
