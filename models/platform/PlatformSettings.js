const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    settingKey: { type: String, default: "platform", unique: true },
    paymentSettings: {
      razorpayEnabled: { type: Boolean, default: false },
      razorpayKeyId: { type: String, default: "" },
      razorpayKeySecret: { type: String, default: "" },
      razorpayWebhookSecret: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
