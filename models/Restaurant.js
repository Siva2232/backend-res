const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    // Unique human-readable ID (e.g. RESTO001)
    restaurantId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    name: { type: String, required: true, trim: true },

    // Cloudinary URL for logo
    logo: { type: String, default: "" },

    // Branding / White-label
    primaryColor:   { type: String, default: "#f72585" },
    secondaryColor: { type: String, default: "#0f172a" },
    accentColor:    { type: String, default: "#7209b7" },
    theme:          { type: String, enum: ["light", "dark"], default: "light" },
    fontFamily:     { type: String, default: "Inter" },
    customDomain:   { type: String, default: "" },

    // Feature flags — controlled by Super Admin only
    features: {
      hr:            { type: Boolean, default: true },
      accounting:    { type: Boolean, default: true },
      inventory:     { type: Boolean, default: false },
      reports:       { type: Boolean, default: true },
      qrMenu:        { type: Boolean, default: true },
      onlineOrders:  { type: Boolean, default: false },
      kitchenPanel:  { type: Boolean, default: true },
      waiterPanel:   { type: Boolean, default: true },
    },

    // Subscription
    subscriptionPlan:   { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
    subscriptionStatus: { type: String, enum: ["active", "expired", "trial", "suspended"], default: "trial" },
    subscriptionExpiry: { type: Date, default: null },

    // Payment history
    paymentHistory: [
      {
        amount:    { type: Number, required: true },
        date:      { type: Date, default: Date.now },
        method:    { type: String, default: "manual" },
        reference: { type: String, default: "" },
        plan:      { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan" },
      },
    ],

    // Contact & Meta
    ownerName:   { type: String, default: "" },
    ownerEmail:  { type: String, default: "" },
    ownerPhone:  { type: String, default: "" },
    address:     { type: String, default: "" },
    isActive:    { type: Boolean, default: true },

    // Expiry reminder tracking (so we don't spam)
    reminderSent3Days:  { type: Boolean, default: false },
    reminderSent1Day:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Reset reminder flags when a new expiry date is assigned
restaurantSchema.pre("save", function () {
  if (this.isModified("subscriptionExpiry")) {
    this.reminderSent3Days = false;
    this.reminderSent1Day  = false;
  }
});

module.exports = mongoose.model("Restaurant", restaurantSchema);
