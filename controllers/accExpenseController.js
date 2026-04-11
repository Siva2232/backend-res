const AccExpenseBaseModel = require('../models/AccExpense');
const { getModel } = require('../utils/getModel');

const AccExpense = async (req) => getModel('AccExpense', AccExpenseBaseModel.schema, req.restaurantId);
const AccPartyBaseModel2 = require('../models/AccParty');
const AccParty = async (req) => getModel('AccParty', AccPartyBaseModel2.schema, req.restaurantId);
const { buildExpenseEntries, createLedgerEntries, reverseLedgerEntries } = require('../utils/accLedgerUtils');

// @route GET /api/acc/expenses
const getExpenses = async (req, res) => {
  try {
    const { status, category, party, from, to, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (party) query.party = party;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    if (search) query.expenseNo = { $regex: search, $options: 'i' };
    const total = await (await AccExpense(req)).countDocuments(query);
    const expenses = await (await AccExpense(req)).find(query)
      .populate('party', 'name phone type')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ expenses, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/expenses/:id
const getExpense = async (req, res) => {
  try {
    const expense = await (await AccExpense(req)).findById(req.params.id)
      .populate('party', 'name phone email address')
      .populate('ledgerEntries');
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/expenses
const createExpense = async (req, res) => {
  try {
    const { totalAmount, paidAmount = 0, paymentMode, category, date, party: partyId, ...rest } = req.body;
    const balance = totalAmount - paidAmount;
    const status = paidAmount <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid' : 'Partial';

    const expense = await (await AccExpense(req)).create({ ...rest, totalAmount, paidAmount, balance, status, paymentMode, category, date, party: partyId });
    const entries = await buildExpenseEntries({ category, totalAmount, paidAmount, balance, paymentMode, date: date ? new Date(date) : new Date() , restaurantId: req.restaurantId, restaurantId: req.restaurantId});
    const saved = await createLedgerEntries(entries, 'AccExpense', expense._id, partyId, null, req.restaurantId);
    expense.ledgerEntries = saved.map(e => e._id);
    await expense.save();

    if (partyId && balance > 0) {
      (await AccParty(req)).findByIdAndUpdate(partyId, { $inc: { balance: -balance } });
    }
    res.status(201).json(expense);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route PUT /api/acc/expenses/:id
const updateExpense = async (req, res) => {
  try {
    const expense = await (await AccExpense(req)).findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    const oldBalance = expense.balance;
    const partyId = expense.party;
    await reverseLedgerEntries(expense.ledgerEntries, req.restaurantId);
    if (partyId && oldBalance > 0) {
      (await AccParty(req)).findByIdAndUpdate(partyId, { $inc: { balance: oldBalance } });
    }

    const { totalAmount, paidAmount = 0, paymentMode, category, date } = { ...expense.toObject(), ...req.body };
    const balance = totalAmount - paidAmount;
    const status = paidAmount <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid' : 'Partial';

    Object.assign(expense, req.body, { balance, status });
    const entries = await buildExpenseEntries({ category, totalAmount, paidAmount, balance, paymentMode, date: date ? new Date(date) : new Date() , restaurantId: req.restaurantId, restaurantId: req.restaurantId});
    const saved = await createLedgerEntries(entries, 'AccExpense', expense._id, expense.party, null, req.restaurantId);
    expense.ledgerEntries = saved.map(e => e._id);
    await expense.save();

    if (expense.party && balance > 0) {
      (await AccParty(req)).findByIdAndUpdate(expense.party, { $inc: { balance: -balance } });
    }
    res.json(expense);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/expenses/:id
const deleteExpense = async (req, res) => {
  try {
    const expense = await (await AccExpense(req)).findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await reverseLedgerEntries(expense.ledgerEntries, req.restaurantId);
    if (expense.party && expense.balance > 0) {
      (await AccParty(req)).findByIdAndUpdate(expense.party, { $inc: { balance: expense.balance } });
    }
    await expense.deleteOne();
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense };
