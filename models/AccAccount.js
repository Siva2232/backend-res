const mongoose = require('mongoose');

// Chart of Accounts
const accAccountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true }, // e.g. "1001"
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Asset', 'Liability', 'Equity', 'Income', 'Expense'],
      required: true,
    },
    subType: {
      type: String,
      trim: true,
      // Assets: Cash, Bank, Inventory, Accounts Receivable, Advances, Other Asset
      // Liabilities: Accounts Payable, Loans Payable, Customer Advances, Other Liability
      // Equity: Capital, Retained Earnings
      // Income: Sales, Beverage Sales, Other Income
      // Expense: Purchase Cost, Salary, Rent, Utilities, Other Expenses, Taxes
    },
    description: { type: String },
    openingBalance: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, // running balance
    isSystem: { type: Boolean, default: false }, // system accounts cannot be deleted
    isActive: { type: Boolean, default: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'AccAccount' },
  },
  { timestamps: true }
);

accAccountSchema.index({ code: 1 });

module.exports = mongoose.model('AccAccount', accAccountSchema);
