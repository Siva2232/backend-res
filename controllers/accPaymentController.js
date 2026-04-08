const AccPaymentBaseModel = require('../models/AccPayment');
const { getModel } = require('../utils/getModel');

const AccPayment = (req) => getModel('AccPayment', AccPaymentBaseModel.schema, req.restaurantId);
const AccOrderModel2 = require('../models/AccOrder');
const AccOrder = (req) => getModel('AccOrder', AccOrderModel2.schema, req.restaurantId);
const AccPurchaseModel2 = require('../models/AccPurchase');
const AccPurchase = (req) => getModel('AccPurchase', AccPurchaseModel2.schema, req.restaurantId);
const AccExpenseModel2 = require('../models/AccExpense');
const AccExpense = (req) => getModel('AccExpense', AccExpenseModel2.schema, req.restaurantId);
const AccPartyModel2 = require('../models/AccParty');
const AccParty = (req) => getModel('AccParty', AccPartyModel2.schema, req.restaurantId);
const AccLedgerEntryModel2 = require('../models/AccLedgerEntry');
const AccLedgerEntry = (req) => getModel('AccLedgerEntry', AccLedgerEntryModel2.schema, req.restaurantId);
const { CODES, getAccount, createLedgerEntries, reverseLedgerEntries } = require('../utils/accLedgerUtils');

const getRefModel = (refModelName, req) => getModel(refModelName, { AccOrder: AccOrderModel2.schema, AccPurchase: AccPurchaseModel2.schema, AccExpense: AccExpenseModel2.schema }[refModelName], req.restaurantId);

// Helper: determine direction and AR/AP code based on model
const getDirection = (refModel) => {
  if (refModel === 'AccOrder') return { direction: 'receive', code: CODES.ACCOUNTS_RECEIVABLE };
  return { direction: 'pay', code: CODES.ACCOUNTS_PAYABLE };
};

// @route GET /api/acc/payments
const getPayments = async (req, res) => {
  try {
    const { refModel, refId, party, from, to, page = 1, limit = 20 } = req.query;
    const query = {};
    if (refModel) query.refModel = refModel;
    if (refId) query.refId = refId;
    if (party) query.party = party;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    const total = await AccPayment(req).countDocuments(query);
    const payments = await AccPayment(req).find(query)
      .populate('party', 'name phone')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ payments, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/payments
const createPayment = async (req, res) => {
  try {
    const { refModel, refId, amount, mode, date, party: partyId, notes } = req.body;

    const Model = getRefModel(refModel, req);
    if (!Model) return res.status(400).json({ message: 'Invalid refModel' });

    const doc = await Model.findById(refId);
    if (!doc) return res.status(404).json({ message: 'Referenced document not found' });

    const remaining = doc.balance ?? 0;
    if (amount > remaining + 0.001) {
      return res.status(400).json({ message: `Payment exceeds outstanding balance (${remaining.toFixed(2)})` });
    }

    // Create payment record
    const payment = await AccPayment(req).create({ refModel, refId, amount, mode: mode || 'Cash', date, party: partyId || doc.party, notes });

    // Build ledger entries
    const { direction, code } = getDirection(refModel);
    const contraAcc = await getAccount(code);
    const cashAcc = await getAccount(CODES.CASH);
    const entries = [];
    if (direction === 'receive') {
      entries.push({ account: cashAcc._id, debit: amount, credit: 0, description: `Payment received (${mode || 'Cash'})`, date: date ? new Date(date) : new Date() });
      entries.push({ account: contraAcc._id, debit: 0, credit: amount, description: 'AR cleared', date: date ? new Date(date) : new Date() });
    } else {
      entries.push({ account: contraAcc._id, debit: amount, credit: 0, description: 'AP cleared', date: date ? new Date(date) : new Date() });
      entries.push({ account: cashAcc._id, debit: 0, credit: amount, description: `Payment made (${mode || 'Cash'})`, date: date ? new Date(date) : new Date() });
    }
    const saved = await createLedgerEntries(entries, 'AccPayment', payment._id, payment.party);
    payment.ledgerEntries = saved.map(e => e._id);
    await payment.save();

    // Update parent doc
    const newPaid = (doc.paidAmount || 0) + amount;
    const newBalance = Math.max(0, (doc.totalAmount || doc.amount || 0) - newPaid);
    const newStatus = newBalance <= 0.001 ? 'Paid' : 'Partial';
    doc.paidAmount = newPaid;
    doc.balance = newBalance;
    doc.status = newStatus;
    if (!doc.paymentMode) doc.paymentMode = mode;
    await doc.save();

    // Update party balance
    const pId = partyId || doc.party;
    if (pId) {
      const delta = direction === 'receive' ? -amount : amount;
      await AccParty(req).findByIdAndUpdate(pId, { $inc: { balance: delta } });
    }

    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/payments/:id
const deletePayment = async (req, res) => {
  try {
    const payment = await AccPayment(req).findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const Model = getRefModel(payment.refModel, req);
    await reverseLedgerEntries(payment.ledgerEntries);

    if (Model) {
      const doc = await Model.findById(payment.refId);
      if (doc) {
        doc.paidAmount = Math.max(0, (doc.paidAmount || 0) - payment.amount);
        doc.balance = (doc.totalAmount || 0) - doc.paidAmount;
        doc.status = doc.paidAmount <= 0 ? 'Unpaid' : doc.balance <= 0 ? 'Paid' : 'Partial';
        await doc.save();
      }
    }

    const { direction } = getDirection(payment.refModel);
    const pId = payment.party;
    if (pId) {
      const delta = direction === 'receive' ? payment.amount : -payment.amount;
      await AccParty(req).findByIdAndUpdate(pId, { $inc: { balance: delta } });
    }

    await payment.deleteOne();
    res.json({ message: 'Payment deleted and reversed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPayments, createPayment, deletePayment };
