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
    // Add flexible subitem groups (modifiers/variants)
    subItems: [
      {
        groupName: { type: String, required: true },
        type: { type: String, enum: ["single", "multiple"], default: "single" },
        required: { type: Boolean, default: false },
        options: [
          {
            name: { type: String, required: true },
            price: { type: Number, default: 0 },
            extraDescription: { type: String },
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
