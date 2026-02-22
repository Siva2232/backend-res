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
      enum: ["Pending", "Preparing", "Served", "Paid", "Cancelled"],
      default: "Pending",
    },
    paymentMethod: { type: String, default: "Cash" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
