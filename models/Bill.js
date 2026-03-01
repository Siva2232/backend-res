const mongoose = require("mongoose");

// A bill is essentially a snapshot of an order at the time of creation.  
// We keep a separate collection to allow printing / auditing invoices without
// affecting or depending on the live order data.  Bills are created
// automatically when an order is placed, and can also be added manually if
// needed.

const billSchema = mongoose.Schema(
  {
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    table: { type: String, required: true },
    customerName: { type: String },
    customerAddress: { type: String },
    deliveryTime: { type: String }, // optional estimated delivery time
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        price: { type: Number, required: true },
        image: { type: String },
      },
    ],
    totalAmount: { type: Number, required: true },
    status: { type: String, required: true },
    paymentMethod: { type: String },
    notes: { type: String },
    billDetails: {
      subtotal: { type: Number },
      cgst: { type: Number },
      sgst: { type: Number },
      grandTotal: { type: Number },
    },
    // save the timestamp when the bill was generated (usually order.createdAt)
    billedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bill", billSchema);
