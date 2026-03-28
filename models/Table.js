const mongoose = require("mongoose");

const tableSchema = mongoose.Schema(
  {
    tableId: {
      type: Number,
      required: true,
      unique: true,
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

const Table = mongoose.model("Table", tableSchema);

module.exports = Table;
