const AccOrderBaseModel = require('../models/AccOrder');
const { getModel } = require('../utils/getModel');

const AccOrder = (req) => getModel('AccOrder', AccOrderBaseModel.schema, req.restaurantId);
const AccPartyBaseModel2 = require('../models/AccParty');
const AccParty = (req) => getModel('AccParty', AccPartyBaseModel2.schema, req.restaurantId);
const { buildSalesEntries, createLedgerEntries, reverseLedgerEntries } = require('../utils/accLedgerUtils');

// @route GET /api/acc/orders
const getOrders = async (req, res) => {
  try {
    const { status, party, from, to, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (party) query.party = party;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    if (search) query.orderNo = { $regex: search, $options: 'i' };
    const total = await AccOrder(req).countDocuments(query);
    const orders = await AccOrder(req).find(query)
      .populate('party', 'name phone type')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/orders/:id
const getOrder = async (req, res) => {
  try {
    const order = await AccOrder(req).findById(req.params.id)
      .populate('party', 'name phone email address')
      .populate('ledgerEntries');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/orders
const createOrder = async (req, res) => {
  try {
    const { totalAmount, paidAmount = 0, paymentMode, date, party: partyId, ...rest } = req.body;
    const balance = totalAmount - paidAmount;
    const status = paidAmount <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid' : 'Partial';

    const order = await AccOrder(req).create({ ...rest, totalAmount, paidAmount, balance, status, paymentMode, date, party: partyId });

    // Build and persist ledger entries
    const entries = await buildSalesEntries({ totalAmount, paidAmount, balance, paymentMode, date: date ? new Date(date) : new Date() });
    const saved = await createLedgerEntries(entries, 'AccOrder', order._id, partyId);
    order.ledgerEntries = saved.map(e => e._id);
    await order.save();

    // Update party balance (positive = receivable/they owe us)
    if (partyId && balance > 0) {
      await AccParty(req).findByIdAndUpdate(partyId, { $inc: { balance: balance } });
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route PUT /api/acc/orders/:id
const updateOrder = async (req, res) => {
  try {
    const order = await AccOrder(req).findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const oldBalance = order.balance;
    const partyId = order.party;

    // Reverse existing ledger entries
    await reverseLedgerEntries(order.ledgerEntries);
    if (partyId && oldBalance > 0) {
      await AccParty(req).findByIdAndUpdate(partyId, { $inc: { balance: -oldBalance } });
    }

    const { totalAmount, paidAmount = 0, paymentMode, date } = { ...order.toObject(), ...req.body };
    const balance = totalAmount - paidAmount;
    const status = paidAmount <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid' : 'Partial';

    Object.assign(order, req.body, { balance, status });
    const entries = await buildSalesEntries({ totalAmount, paidAmount, balance, paymentMode, date: date ? new Date(date) : new Date() });
    const saved = await createLedgerEntries(entries, 'AccOrder', order._id, order.party);
    order.ledgerEntries = saved.map(e => e._id);
    await order.save();

    if (order.party && balance > 0) {
      await AccParty(req).findByIdAndUpdate(order.party, { $inc: { balance: balance } });
    }
    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/orders/:id
const deleteOrder = async (req, res) => {
  try {
    const order = await AccOrder(req).findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    await reverseLedgerEntries(order.ledgerEntries);
    if (order.party && order.balance > 0) {
      await AccParty(req).findByIdAndUpdate(order.party, { $inc: { balance: -order.balance } });
    }
    await order.deleteOne();
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getOrders, getOrder, createOrder, updateOrder, deleteOrder };
