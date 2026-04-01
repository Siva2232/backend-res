const mongoose = require("mongoose");

// Each transaction is a double-entry record: debits must equal credits
const transactionEntrySchema = new mongoose.Schema(
  {
    ledger: { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
    type: { type: String, enum: ["debit", "credit"], required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    note: { type: String, default: "" },
    reference: { type: String, default: "" }, // e.g. invoice/bill number
    category: { type: mongoose.Schema.Types.ObjectId, ref: "AccountCategory", default: null },
    transactionType: {
      type: String,
      enum: ["expense", "income", "transfer", "journal", "pos_sale"],
      default: "journal",
    },
    entries: [transactionEntrySchema],
    totalAmount: { type: Number, required: true, min: 0 },
    isRecurring: { type: Boolean, default: false },
    recurringId: { type: mongoose.Schema.Types.ObjectId, ref: "RecurringTransaction", default: null },
    posOrderRef: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Auto-update ledger balances before saving
transactionSchema.pre("save", async function () {
  if (!this.isNew) return;
  const Ledger = mongoose.model("Ledger");
  for (const entry of this.entries) {
    const ledger = await Ledger.findById(entry.ledger);
    if (!ledger) continue;
    // For asset/expense: debit increases, credit decreases
    // For liability/income: credit increases, debit decreases
    if (["asset", "expense"].includes(ledger.type)) {
      ledger.currentBalance += entry.type === "debit" ? entry.amount : -entry.amount;
    } else {
      ledger.currentBalance += entry.type === "credit" ? entry.amount : -entry.amount;
    }
    await ledger.save();
  }
});

module.exports = mongoose.model("Transaction", transactionSchema);
