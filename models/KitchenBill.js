const mongoose = require("mongoose");

// KitchenBill represents a single batch of items sent to the kitchen.
// When an order is first placed, a KitchenBill is created for those items.
// When customer adds more items ("Add More Items"), a NEW KitchenBill is 
// created for just the new items. This way kitchen and waiter see separate
// tickets for each batch, while the main Bill remains consolidated for
// customer payment/printing.

const kitchenBillSchema = mongoose.Schema(
  {
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    // batch number for this order (1 = initial order, 2+ = add more items)
    batchNumber: { type: Number, required: true, default: 1 },
    table: { type: String, required: true },
    // flag indicating if this dine-in order also includes takeaway items
    hasTakeaway: { type: Boolean, default: false },
    customerName: { type: String },
    customerAddress: { type: String },
    deliveryTime: { type: String },
    // ONLY the items in this batch (not all items in the order)
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
        addedAt: { type: Date },
        isNewItem: { type: Boolean, default: false },
        isTakeaway: { type: Boolean, default: false },
      },
    ],
    // total for THIS batch only
    batchTotal: { type: Number, required: true },
    // status of this batch (Pending = not started, New, Preparing, Ready, Served)
    status: { 
      type: String, 
      required: true,
      enum: ["Pending", "New", "Preparing", "Ready", "Served", "Cancelled"],
      default: "Pending" 
    },
    notes: { type: String },
    // timestamp when this batch was created
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Index for quick lookups
kitchenBillSchema.index({ orderRef: 1, batchNumber: 1 });
kitchenBillSchema.index({ table: 1 });
kitchenBillSchema.index({ status: 1 });
kitchenBillSchema.index({ createdAt: -1 });
// Compound index for the active kitchen bills query (status + sort)
kitchenBillSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("KitchenBill", kitchenBillSchema);
