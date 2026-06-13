const mongoose = require("mongoose");

const connectorDeviceSchema = new mongoose.Schema(
  {
    connectorId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    restaurantId: {
      type: String,
      required: true,
      index: true,
      uppercase: true,
      trim: true,
    },
    deviceName: { type: String, default: "RestoPrint Device", trim: true },
    deviceTokenHash: { type: String, required: true },
    lastHeartbeatAt: { type: Date },
    isOnline: { type: Boolean, default: false },
    isRevoked: { type: Boolean, default: false, index: true },
    socketId: { type: String },
    printerSettings: {
      invoice: { host: { type: String, default: "" }, port: { type: Number, default: 9100 } },
      kitchen: { host: { type: String, default: "" }, port: { type: Number, default: 9100 } },
      bar: { host: { type: String, default: "" }, port: { type: Number, default: 9100 } },
      delivery: { host: { type: String, default: "" }, port: { type: Number, default: 9100 } },
    },
  },
  { timestamps: true }
);

connectorDeviceSchema.index({ restaurantId: 1, isRevoked: 1 });

module.exports = mongoose.model("ConnectorDevice", connectorDeviceSchema);
