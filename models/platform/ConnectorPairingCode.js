const mongoose = require("mongoose");

const connectorPairingCodeSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: String,
      required: true,
      index: true,
      uppercase: true,
      trim: true,
    },
    pairCode: { type: String, required: true, index: true },
    deviceTokenHash: { type: String, required: true },
    deviceTokenPlain: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ConnectorPairingCode", connectorPairingCodeSchema);
