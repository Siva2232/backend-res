const mongoose = require("mongoose");

const orderSchema = mongoose.Schema(
  {
    table: { type: String, required: true },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        price: { type: Number, required: true },
        image: { type: String, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      // expanded to match front-end statuses and future payment states
      enum: [
        "Pending",
        "Preparing",
        "Cooking",
        "Ready",
        "Served",
        "Paid",
        "Cancelled",
      ],
      default: "Pending",
    },
    paymentMethod: { type: String, default: "Cash" },
    // optional kitchen notes from customer
    notes: { type: String },
    // computed billing details (subtotal, cgst, sgst, grandTotal)
    billDetails: {
      subtotal: { type: Number },
      cgst: { type: Number },
      sgst: { type: Number },
      grandTotal: { type: Number },
    },
  },
  { timestamps: true }
);

// create useful indexes to speed up frequent lookups
orderSchema.index({ table: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
