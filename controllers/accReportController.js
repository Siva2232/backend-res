const AccAccountBaseModel = require('../models/AccAccount');
const AccLedgerEntryBaseModel = require('../models/AccLedgerEntry');
const AccOrderBaseModel = require('../models/AccOrder');
const AccPurchaseBaseModel = require('../models/AccPurchase');
const AccExpenseBaseModel = require('../models/AccExpense');
const AccPartyBaseModel = require('../models/AccParty');
const { getModel } = require('../utils/getModel');

const AccAccount     = async (req) => getModel('AccAccount',     AccAccountBaseModel.schema,     req.restaurantId);
const AccLedgerEntry = async (req) => getModel('AccLedgerEntry', AccLedgerEntryBaseModel.schema, req.restaurantId);
const AccOrder       = async (req) => getModel('AccOrder',       AccOrderBaseModel.schema,       req.restaurantId);
const AccPurchase    = async (req) => getModel('AccPurchase',    AccPurchaseBaseModel.schema,    req.restaurantId);
const AccExpense     = async (req) => getModel('AccExpense',     AccExpenseBaseModel.schema,     req.restaurantId);
const AccParty       = async (req) => getModel('AccParty',       AccPartyBaseModel.schema,       req.restaurantId);

const sumLedger = async (filter, reqCtx) => {
  const res = await (await AccLedgerEntry(reqCtx)).aggregate([
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

    const incomeAccs = await (await AccAccount(req)).find({ type: 'Income' });
    const expenseAccs = await (await AccAccount(req)).find({ type: 'Expense' });

    const incomeRows = await Promise.all(incomeAccs.map(async (acc) => {
      const s = await sumLedger({ account: acc._id, ...dateFilter }, req);
      const amount = s.totalCredit - s.totalDebit; // income: credit normal
      return { _id: acc._id, name: acc.name, subType: acc.subType, amount };
    }));
    const expenseRows = await Promise.all(expenseAccs.map(async (acc) => {
      const s = await sumLedger({ account: acc._id, ...dateFilter }, req);
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
    const assetAccs = await (await AccAccount(req)).find({ type: 'Asset' });
    const liabilityAccs = await (await AccAccount(req)).find({ type: 'Liability' });
    const equityAccs = await (await AccAccount(req)).find({ type: 'Equity' });

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

    const cashAcc = await (await AccAccount(req)).findOne({ code: '1001' });
    const cashBalance = cashAcc ? cashAcc.balance : 0;

    const salesAcc = await (await AccAccount(req)).findOne({ code: '4001' });
    const salesSum = await sumLedger({ account: salesAcc?._id, ...dateFilter }, req);
    const totalSales = salesSum.totalCredit - salesSum.totalDebit;

    const expenseAccs = await (await AccAccount(req)).find({ type: 'Expense' });
    let totalExpenses = 0;
    for (const acc of expenseAccs) {
      const s = await sumLedger({ account: acc._id, ...dateFilter }, req);
      totalExpenses += s.totalDebit - s.totalCredit;
    }

    const orders = await (await AccOrder(req)).countDocuments({ date: { $gte: from, $lte: to } });
    const purchases = await (await AccPurchase(req)).countDocuments({ date: { $gte: from, $lte: to } });
    const expenses = await (await AccExpense(req)).countDocuments({ date: { $gte: from, $lte: to } });

    res.json({ date: dateStr, cashInHand: cashBalance, totalSales, totalExpenses, orders, purchases, expenses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route GET /api/acc/reports/party/:id — party ledger / statement
const getPartyStatement = async (req, res) => {
  try {
    const party = await (await AccParty(req)).findById(req.params.id);
    if (!party) return res.status(404).json({ message: 'Party not found' });

    const [OrderM, PurchaseM, ExpenseM] = await Promise.all([
      AccOrder(req), AccPurchase(req), AccExpense(req),
    ]);
    const [orders, purchases, expenses] = await Promise.all([
      OrderM.find({ party: req.params.id }).populate('ledgerEntries').sort({ date: -1 }),
      PurchaseM.find({ party: req.params.id }).populate('ledgerEntries').sort({ date: -1 }),
      ExpenseM.find({ party: req.params.id }).populate('ledgerEntries').sort({ date: -1 }),
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
