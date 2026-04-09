const AccLoanBaseModel = require('../models/AccLoan');
const { getModel } = require('../utils/getModel');

const AccLoan = async (req) => getModel('AccLoan', AccLoanBaseModel.schema, req.restaurantId);
const { buildLoanEntries, createLedgerEntries, reverseLedgerEntries } = require('../utils/accLedgerUtils');

// @route GET /api/acc/loans
const getLoans = async (req, res) => {
  try {
    const { type, party, from, to, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (type) query.type = type;
    if (party) query.party = party;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    if (search) query.loanNo = { $regex: search, $options: 'i' };
    const total = (await AccLoan(req)).countDocuments(query);
    const loans = (await AccLoan(req)).find(query)
      .populate('party', 'name phone type')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ loans, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/loans/:id
const getLoan = async (req, res) => {
  try {
    const loan = (await AccLoan(req)).findById(req.params.id)
      .populate('party', 'name phone email address')
      .populate('ledgerEntries');
    if (!loan) return res.status(404).json({ message: 'Loan/Advance not found' });
    res.json(loan);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route POST /api/acc/loans
const createLoan = async (req, res) => {
  try {
    const { type, amount, paymentMode, date, party: partyId, ...rest } = req.body;
    const loan = (await AccLoan(req)).create({ ...rest, type, amount, paymentMode, date, party: partyId });
    const entries = await buildLoanEntries({ type, amount, paymentMode, date: date ? new Date(date) : new Date() , restaurantId: req.restaurantId, restaurantId: req.restaurantId});
    const saved = await createLedgerEntries(entries, 'AccLoan', loan._id, partyId, null, req.restaurantId);
    loan.ledgerEntries = saved.map(e => e._id);
    await loan.save();
    res.status(201).json(loan);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route PUT /api/acc/loans/:id
const updateLoan = async (req, res) => {
  try {
    const loan = (await AccLoan(req)).findById(req.params.id);
    if (!loan) return res.status(404).json({ message: 'Loan/Advance not found' });

    await reverseLedgerEntries(loan.ledgerEntries, req.restaurantId);

    const { type, amount, paymentMode, date } = { ...loan.toObject(), ...req.body };
    Object.assign(loan, req.body);
    const entries = await buildLoanEntries({ type, amount, paymentMode, date: date ? new Date(date) : new Date() , restaurantId: req.restaurantId, restaurantId: req.restaurantId});
    const saved = await createLedgerEntries(entries, 'AccLoan', loan._id, loan.party, null, req.restaurantId);
    loan.ledgerEntries = saved.map(e => e._id);
    await loan.save();
    res.json(loan);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route DELETE /api/acc/loans/:id
const deleteLoan = async (req, res) => {
  try {
    const loan = (await AccLoan(req)).findById(req.params.id);
    if (!loan) return res.status(404).json({ message: 'Loan/Advance not found' });
    await reverseLedgerEntries(loan.ledgerEntries, req.restaurantId);
    await loan.deleteOne();
    res.json({ message: 'Loan/Advance deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLoans, getLoan, createLoan, updateLoan, deleteLoan };
