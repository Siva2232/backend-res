const AccPurchase = require('../models/AccPurchase');
const AccParty = require('../models/AccParty');
const { buildPurchaseEntries, createLedgerEntries, reverseLedgerEntries } = require('../utils/accLedgerUtils');

// @route GET /api/acc/purchases
const getPurchases = async (req, res) => {
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
    if (search) query.purchaseNo = { $regex: search, $options: 'i' };
    const total = await AccPurchase.countDocuments(query);
    const purchases = await AccPurchase.find(query)
      .populate('party', 'name phone type')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ purchases, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/purchases/:id
const getPurchase = async (req, res) => {
  try {
    const purchase = await AccPurchase.findById(req.params.id)
      .populate('party', 'name phone email address')
      .populate('ledgerEntries');
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/purchases
const createPurchase = async (req, res) => {
  try {
    const { totalAmount, paidAmount = 0, paymentMode, date, party: partyId, ...rest } = req.body;
    const balance = totalAmount - paidAmount;
    const status = paidAmount <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid' : 'Partial';

    const purchase = await AccPurchase.create({ ...rest, totalAmount, paidAmount, balance, status, paymentMode, date, party: partyId });
    const entries = await buildPurchaseEntries({ totalAmount, paidAmount, balance, paymentMode, date: date ? new Date(date) : new Date() });
    const saved = await createLedgerEntries(entries, 'AccPurchase', purchase._id, partyId);
    purchase.ledgerEntries = saved.map(e => e._id);
    await purchase.save();

    // Negative balance on party = we owe them (payable)
    if (partyId && balance > 0) {
      await AccParty.findByIdAndUpdate(partyId, { $inc: { balance: -balance } });
    }
    res.status(201).json(purchase);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route PUT /api/acc/purchases/:id
const updatePurchase = async (req, res) => {
  try {
    const purchase = await AccPurchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    const oldBalance = purchase.balance;
    const partyId = purchase.party;
    await reverseLedgerEntries(purchase.ledgerEntries);
    if (partyId && oldBalance > 0) {
      await AccParty.findByIdAndUpdate(partyId, { $inc: { balance: oldBalance } });
    }

    const { totalAmount, paidAmount = 0, paymentMode, date } = { ...purchase.toObject(), ...req.body };
    const balance = totalAmount - paidAmount;
    const status = paidAmount <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid' : 'Partial';

    Object.assign(purchase, req.body, { balance, status });
    const entries = await buildPurchaseEntries({ totalAmount, paidAmount, balance, paymentMode, date: date ? new Date(date) : new Date() });
    const saved = await createLedgerEntries(entries, 'AccPurchase', purchase._id, purchase.party);
    purchase.ledgerEntries = saved.map(e => e._id);
    await purchase.save();

    if (purchase.party && balance > 0) {
      await AccParty.findByIdAndUpdate(purchase.party, { $inc: { balance: -balance } });
    }
    res.json(purchase);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/purchases/:id
const deletePurchase = async (req, res) => {
  try {
    const purchase = await AccPurchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    await reverseLedgerEntries(purchase.ledgerEntries);
    if (purchase.party && purchase.balance > 0) {
      await AccParty.findByIdAndUpdate(purchase.party, { $inc: { balance: purchase.balance } });
    }
    await purchase.deleteOne();
    res.json({ message: 'Purchase deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPurchases, getPurchase, createPurchase, updatePurchase, deletePurchase };
