const mongoose = require("mongoose");

/**
 * Platform-scoped print job queue.
 * The actual print happens on an on-prem connector PC; this model is for relay/audit/retry.
 */
const printJobSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    printerTarget: {
      type: String,
      enum: ["invoice", "kitchen", "custom"],
      default: "custom",
    },
    printerHost: { type: String, required: true },
    printerPort: { type: Number, default: 9100 },
    text: { type: String, required: true },

    status: {
      type: String,
      enum: ["queued", "delivered", "printed", "failed"],
      default: "queued",
      index: true,
    },
    deliveredAt: { type: Date },
    printedAt: { type: Date },
    failedAt: { type: Date },
    errorMessage: { type: String },

    connectorSocketId: { type: String },
  },
  { timestamps: true }
);

printJobSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports = mongoose.model("PrintJob", printJobSchema);

