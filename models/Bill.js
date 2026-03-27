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
    // flag indicating if this dine-in bill also includes takeaway items
    hasTakeaway: { type: Boolean, default: false },
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
        // Portion & Add-on selections
        selectedPortion: { type: String },
        selectedAddons: [{ name: String, price: Number }],
        // Fields for "Add More Items" tracking
        addedAt: { type: Date },
        isNewItem: { type: Boolean, default: false },
        // Flag for items that are takeaway within a dine-in order
        isTakeaway: { type: Boolean, default: false },
      },
    ],
    totalAmount: { type: Number, required: true },
    status: { type: String, required: true },
    paymentMethod: { type: String, default: "cod" }, // "cod" or "online"
    paymentStatus: { type: String, default: "pending" }, // "pending" or "paid"
    paymentId: { type: String }, // Stripe payment intent ID for online payments
    paymentSessions: [
      {
        method: { type: String }, // "online" or "cod"
        status: { type: String }, // "paid" or "pending"
        amount: { type: Number },
        id: { type: String }, // stripe intent id
        addedAt: { type: Date, default: Date.now },
      }
    ],
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

// Speed up the default today-only query used by the admin billing screen
billSchema.index({ billedAt: -1 });
// Compound index for createdAt fallback queries
billSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Bill", billSchema);
