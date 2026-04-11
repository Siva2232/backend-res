const mongoose = require("mongoose");

const superAdminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["payment", "new_restaurant", "subscription_expiry", "suspension", "system"],
      default: "payment",
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    restaurantId: { type: String, default: "" },
    restaurantName: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    planName: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SuperAdminNotification", superAdminNotificationSchema);
