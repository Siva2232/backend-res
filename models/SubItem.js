const mongoose = require("mongoose");

const subItemSchema = new mongoose.Schema(
  {
    // "portion" or "addonGroup"
    type: {
      type: String,
      enum: ["portion", "addonGroup"],
      required: true,
    },

    // For portions: e.g. "Half", "Full", "Family Pack"
    // For addonGroups: the group name e.g. "Dips & Sauces"
    name: { type: String, required: true, trim: true },

    // Availability status
    isAvailable: { type: Boolean, default: true },

    // Only for portions – default price suggestion
    price: { type: Number, default: 0 },

    // Only for addonGroups – max selections (0 = unlimited)
    maxSelections: { type: Number, default: 0 },

    // Only for addonGroups – list of addons inside this group
    addons: [
      {
        name: { type: String, trim: true },
        price: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubItem", subItemSchema);
