const AccAccount = require('../models/AccAccount');
const AccLedgerEntry = require('../models/AccLedgerEntry');
const AccOrder = require('../models/AccOrder');
const AccPurchase = require('../models/AccPurchase');
const AccExpense = require('../models/AccExpense');
const AccParty = require('../models/AccParty');

const sumLedger = async (filter) => {
  const res = await AccLedgerEntry.aggregate([
    { $match: filter },
    { $group: { _id: null, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } },
  ]);
  return res[0] || { totalDebit: 0, totalCredit: 0 };
};

// @route GET /api/acc/reports/pl?from=&to=
const getProfitLoss = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = buildDateFilter(from, to);

    const incomeAccs = await AccAccount.find({ type: 'Income' });
    const expenseAccs = await AccAccount.find({ type: 'Expense' });

    const incomeRows = await Promise.all(incomeAccs.map(async (acc) => {
      const s = await sumLedger({ account: acc._id, ...dateFilter });
      const amount = s.totalCredit - s.totalDebit; // income: credit normal
      return { _id: acc._id, name: acc.name, subType: acc.subType, amount };
    }));
    const expenseRows = await Promise.all(expenseAccs.map(async (acc) => {
      const s = await sumLedger({ account: acc._id, ...dateFilter });
      const amount = s.totalDebit - s.totalCredit; // expense: debit normal
      return { _id: acc._id, name: acc.name, subType: acc.subType, amount };
    }));

    const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    res.json({ incomeRows, expenseRows, totalIncome, totalExpenses, netProfit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/reports/balance-sheet
const getBalanceSheet = async (req, res) => {
  try {
    const assetAccs = await AccAccount.find({ type: 'Asset' });
    const liabilityAccs = await AccAccount.find({ type: 'Liability' });
    const equityAccs = await AccAccount.find({ type: 'Equity' });

    const mapAccs = (accs) => accs.map(a => ({
      _id: a._id,
      name: a.name,
      code: a.code,
      subType: a.subType,
      balance: a.balance,
    }));

    const assets = mapAccs(assetAccs);
    const liabilities = mapAccs(liabilityAccs);
    const equity = mapAccs(equityAccs);

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

    res.json({ assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/reports/aging?type=receivable|payable
const getAgingReport = async (req, res) => {
  try {
    const { type = 'receivable' } = req.query;
    const isReceivable = type === 'receivable';
    const Model = isReceivable ? AccOrder : AccPurchase;

    const unpaid = await Model.find({ status: { $in: ['Unpaid', 'Partial'] } })
      .populate('party', 'name phone')
      .sort({ date: 1 });

    const now = Date.now();
    const buckets = { '0-30': [], '31-60': [], '60+': [] };

    unpaid.forEach(doc => {
      const days = Math.floor((now - new Date(doc.date).getTime()) / (1000 * 60 * 60 * 24));
      const entry = {
        _id: doc._id,
        no: doc.orderNo || doc.purchaseNo,
        party: doc.party,
        date: doc.date,
        totalAmount: doc.totalAmount,
        paidAmount: doc.paidAmount,
        balance: doc.balance,
        status: doc.status,
        days,
      };
      if (days <= 30) buckets['0-30'].push(entry);
      else if (days <= 60) buckets['31-60'].push(entry);
      else buckets['60+'].push(entry);
    });

    const sum = (arr) => arr.reduce((s, e) => s + e.balance, 0);
    res.json({
      type,
      buckets,
      totals: { '0-30': sum(buckets['0-30']), '31-60': sum(buckets['31-60']), '60+': sum(buckets['60+']) },
      grandTotal: sum(unpaid.map(d => ({ balance: d.balance }))),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/reports/daily?date=
const getDailyClosing = async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const from = new Date(dateStr);
    const to = new Date(new Date(dateStr).setHours(23, 59, 59, 999));
    const dateFilter = { date: { $gte: from, $lte: to } };

    const cashAcc = await AccAccount.findOne({ code: '1001' });
    const cashBalance = cashAcc ? cashAcc.balance : 0;

    const salesSum = await sumLedger({ account: (await AccAccount.findOne({ code: '4001' }))?._id, ...dateFilter });
    const totalSales = salesSum.totalCredit - salesSum.totalDebit;

    const expenseAccs = await AccAccount.find({ type: 'Expense' });
    let totalExpenses = 0;
    for (const acc of expenseAccs) {
      const s = await sumLedger({ account: acc._id, ...dateFilter });
      totalExpenses += s.totalDebit - s.totalCredit;
    }

    const orders = await AccOrder.countDocuments({ date: { $gte: from, $lte: to } });
    const purchases = await AccPurchase.countDocuments({ date: { $gte: from, $lte: to } });
    const expenses = await AccExpense.countDocuments({ date: { $gte: from, $lte: to } });

    res.json({ date: dateStr, cashInHand: cashBalance, totalSales, totalExpenses, orders, purchases, expenses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/reports/party/:id — party ledger / statement
const getPartyStatement = async (req, res) => {
  try {
    const party = await AccParty.findById(req.params.id);
    if (!party) return res.status(404).json({ message: 'Party not found' });

    const [orders, purchases, expenses] = await Promise.all([
      AccOrder.find({ party: req.params.id }).populate('ledgerEntries').sort({ date: -1 }),
      AccPurchase.find({ party: req.params.id }).populate('ledgerEntries').sort({ date: -1 }),
      AccExpense.find({ party: req.params.id }).populate('ledgerEntries').sort({ date: -1 }),
    ]);

    res.json({ party, orders, purchases, expenses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Helper
const buildDateFilter = (from, to) => {
  if (!from && !to) return {};
  const f = {};
  if (from) f.$gte = new Date(from);
  if (to) f.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return { date: f };
};

module.exports = { getProfitLoss, getBalanceSheet, getAgingReport, getDailyClosing, getPartyStatement };
