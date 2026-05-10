const mongoose = require("mongoose");

const categorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.index({ name: 1 }, { unique: true });

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
