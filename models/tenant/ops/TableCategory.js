const mongoose = require("mongoose");

const tableCategorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

tableCategorySchema.index({ name: 1 }, { unique: true });

const TableCategory = mongoose.model("TableCategory", tableCategorySchema);

module.exports = TableCategory;
