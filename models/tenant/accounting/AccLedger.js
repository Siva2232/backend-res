const mongoose = require("mongoose");

const accLedgerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["asset", "income", "expense", "liability", "equity"],
    },
    bankDetails: {
      accountNumber: String,
      ifsc: String,
      branch: String,
      mobile: String,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    // We'll use this for quick ID in shared code (Cash, Bank, Sales, etc.)
    code: {
      type: String,
      unique: true,
      sparse: true,
    },
    restaurantId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccLedger", accLedgerSchema);
