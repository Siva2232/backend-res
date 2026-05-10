const mongoose = require("mongoose");

const tableSchema = mongoose.Schema(
  {
    tableId: {
      type: Number,
      required: true,
    },
    capacity: {
      type: Number,
      default: 4,
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

tableSchema.index({ tableId: 1 }, { unique: true });

const Table = mongoose.model("Table", tableSchema);

module.exports = Table;
