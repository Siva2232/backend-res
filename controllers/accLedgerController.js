const AccLedgerEntryBaseModel = require('../models/AccLedgerEntry');
const { getModel } = require('../utils/getModel');

const AccLedgerEntry = async (req) => getModel('AccLedgerEntry', AccLedgerEntryBaseModel.schema, req.restaurantId);
const AccAccountBaseModel2 = require('../models/AccAccount');
const AccAccount = async (req) => getModel('AccAccount', AccAccountBaseModel2.schema, req.restaurantId);

// @route GET /api/acc/ledger
const getLedgerEntries = async (req, res) => {
  try {
    const { account, party, refModel, from, to, page = 1, limit = 50, txnId } = req.query;
    const query = {};
    if (account) query.account = account;
    if (party) query.party = party;
    if (refModel) query.refModel = refModel;
    if (txnId) query.txnId = txnId;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    const total = (await AccLedgerEntry(req)).countDocuments(query);
    const entries = (await AccLedgerEntry(req)).find(query)
      .populate('account', 'name code type subType')
      .populate('party', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ entries, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/ledger/account/:id  — Ledger statement for one account
const getAccountStatement = async (req, res) => {
  try {
    const { from, to } = req.query;
    const acc = (await AccAccount(req)).findById(req.params.id);
    if (!acc) return res.status(404).json({ message: 'Account not found' });

    const query = { account: req.params.id };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    const entries = (await AccLedgerEntry(req)).find(query)
      .populate('party', 'name')
      .sort({ date: 1, createdAt: 1 });

    // Compute running balance
    let runningBalance = acc.openingBalance || 0;
    const isDebitNormal = acc.type === 'Asset' || acc.type === 'Expense';
    const rows = entries.map(e => {
      const delta = isDebitNormal ? (e.debit - e.credit) : (e.credit - e.debit);
      runningBalance += delta;
      return { ...e.toObject(), runningBalance };
    });

    res.json({ account: acc, entries: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLedgerEntries, getAccountStatement };
