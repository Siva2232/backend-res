const mongoose = require("mongoose");

const productSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    category: { type: String, required: true, default: "Main" },
    description: { type: String },
    type: { type: String, enum: ["veg", "non-veg", ""], default: "" },
    stock: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },

    // --- Portions (variants like Half / Full) ---
    hasPortions: { type: Boolean, default: false },
    portions: [
      {
        name: { type: String },
        price: { type: Number },
        isAvailable: { type: Boolean, default: true },
      },
    ],

    // --- Add-on groups (extras like cheese, toppings) ---
    addonGroups: [
      {
        name: { type: String },
        // max number of addons a customer can pick from this group (0 = unlimited)
        maxSelections: { type: Number, default: 0 },
        isAvailable: { type: Boolean, default: true },
        addons: [
          {
            name: { type: String },
            price: { type: Number, default: 0 },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

// simple indexes to make common filters faster
productSchema.index({ category: 1 });
productSchema.index({ isAvailable: 1 });

module.exports = mongoose.model("Product", productSchema);
