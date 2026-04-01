const mongoose = require("mongoose");

const accountCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["expense", "income"], required: true },
    color: { type: String, default: "#6366f1" },
    icon: { type: String, default: "tag" },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccountCategory", accountCategorySchema);
