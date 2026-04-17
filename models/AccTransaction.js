const mongoose = require("mongoose");

const accTransactionSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    referenceType: {
      type: String,
      enum: ["Bill", "Manual", "Expense", "Purchase"],
    },
    entries: [
      {
        ledger: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "AccLedger",
          required: true,
        },
        type: {
          type: String,
          enum: ["debit", "credit"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    restaurantId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccTransaction", accTransactionSchema);
