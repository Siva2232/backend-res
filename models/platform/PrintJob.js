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
      enum: ["invoice", "kitchen", "bar", "delivery", "custom"],
      default: "custom",
    },
    printerType: {
      type: String,
      enum: ["invoice", "kitchen", "bar", "delivery", "custom"],
    },
    type: {
      type: String,
      enum: ["invoice", "kot", "bar", "delivery", "custom"],
    },
    payload: { type: mongoose.Schema.Types.Mixed },
    printerHost: { type: String, default: "" },
    printerPort: { type: Number, default: 9100 },
    text: { type: String, default: "" },
    /** When "base64", `text` holds ESC/POS bytes from the web app (exact print layout). */
    textEncoding: { type: String, default: "" },

    status: {
      type: String,
      enum: ["queued", "delivered", "printing", "printed", "failed"],
      default: "queued",
      index: true,
    },
    lockedByConnectorId: { type: String, index: true },
    lockedAt: { type: Date },
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

