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

categorySchema.index({ restaurantId: 1, name: 1 }, { unique: true });

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
