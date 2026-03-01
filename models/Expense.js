const mongoose = require("mongoose");

const expenseSchema = mongoose.Schema(
  {
    date: { type: Date, required: true },
    desc: { type: String, required: true },
    amount: { type: Number, required: true },
    category: {
      type: String,
      required: true,
      enum: ["purchase", "utility", "direct", "indirect"],
    },
  },
  { timestamps: true }
);

// index on category+date to support quick filtering
expenseSchema.index({ category: 1, date: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
