const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
});

const accOrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String },
    date: { type: Date, default: Date.now },
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'AccParty' }, // customer
    items: [orderItemSchema],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['Paid', 'Partial', 'Unpaid'], default: 'Unpaid' },
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Split', ''], default: '' },
    notes: { type: String },
    ledgerEntries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AccLedgerEntry' }],
  },
  { timestamps: true }
);

// Auto-increment order number
accOrderSchema.pre('save', async function () {
  if (this.isNew && !this.orderNo) {
    const last = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
    const num = last ? parseInt(last.orderNo?.replace('SO-', '') || 0) + 1 : 1;
    this.orderNo = `SO-${String(num).padStart(4, '0')}`;
  }
});


module.exports = mongoose.model('AccOrder', accOrderSchema);
