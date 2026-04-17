const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true }, // Basic, Pro, Premium
    price:       { type: Number, required: true },      // Monthly price in base currency
    duration:    { type: Number, required: true, default: 30 }, // Days of access
    description: { type: String, default: "" },
    isActive:    { type: Boolean, default: true },

    // Which features are included in this plan
    features: {
      hr:           { type: Boolean, default: false },
      inventory:    { type: Boolean, default: false },
      reports:      { type: Boolean, default: true },
      qrMenu:       { type: Boolean, default: true },
      onlineOrders: { type: Boolean, default: false },
      kitchenPanel: { type: Boolean, default: true },
      waiterPanel:  { type: Boolean, default: true },
    },

    // Soft limits
    maxTables:   { type: Number, default: 20 },
    maxProducts: { type: Number, default: 100 },
    maxStaff:    { type: Number, default: 10 },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
