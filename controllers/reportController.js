const Transaction = require("../models/Transaction");
const Ledger = require("../models/Ledger");

// GET /api/accounting/reports/summary?from=&to=
exports.getSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(new Date(to).setHours(23, 59, 59));
    const filter = {};
    if (from || to) filter.date = dateFilter;

    const transactions = await Transaction.find(filter).populate("entries.ledger", "name type");

    let totalIncome = 0, totalExpense = 0;
    for (const tx of transactions) {
      if (tx.transactionType === "income" || tx.transactionType === "pos_sale") {
        totalIncome += tx.totalAmount;
      } else if (tx.transactionType === "expense") {
        totalExpense += tx.totalAmount;
      }
    }

    const netProfit = totalIncome - totalExpense;
    res.json({ totalIncome, totalExpense, netProfit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/reports/monthly?year=2026
exports.getMonthlyReport = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const from = new Date(`${year}-01-01`);
    const to = new Date(`${year}-12-31T23:59:59`);

    const transactions = await Transaction.find({ date: { $gte: from, $lte: to } });

    // Build 12-month breakdown
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: new Date(year, i, 1).toLocaleString("default", { month: "short" }),
      income: 0,
      expense: 0,
    }));

    for (const tx of transactions) {
      const m = new Date(tx.date).getMonth(); // 0-indexed
      if (tx.transactionType === "income" || tx.transactionType === "pos_sale") {
        months[m].income += tx.totalAmount;
      } else if (tx.transactionType === "expense") {
        months[m].expense += tx.totalAmount;
      }
    }

    months.forEach((m) => { m.profit = m.income - m.expense; });
    res.json(months);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/reports/cashflow?from=&to=
exports.getCashFlow = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(new Date(to).setHours(23, 59, 59));
    const filter = {};
    if (from || to) filter.date = dateFilter;

    const transactions = await Transaction.find(filter).populate("entries.ledger", "name type");

    let cashIn = 0, cashOut = 0;
    for (const tx of transactions) {
      for (const entry of tx.entries) {
        const ledger = entry.ledger;
        if (!ledger || ledger.type !== "asset") continue;
        if (entry.type === "debit") cashIn += entry.amount;
        else cashOut += entry.amount;
      }
    }

    res.json({ cashIn, cashOut, netCash: cashIn - cashOut });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/reports/pl?from=&to=  — Profit & Loss
exports.getProfitLoss = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(new Date(to).setHours(23, 59, 59));
    const filter = {};
    if (from || to) filter.date = dateFilter;

    const transactions = await Transaction.find(filter)
      .populate("entries.ledger", "name type")
      .populate("category", "name color");

    // Group income by category, expense by category
    const incomeMap = {};
    const expenseMap = {};

    for (const tx of transactions) {
      const key = tx.category?.name || "Uncategorized";
      const color = tx.category?.color || "#6366f1";
      if (tx.transactionType === "income" || tx.transactionType === "pos_sale") {
        if (!incomeMap[key]) incomeMap[key] = { name: key, color, amount: 0 };
        incomeMap[key].amount += tx.totalAmount;
      } else if (tx.transactionType === "expense") {
        if (!expenseMap[key]) expenseMap[key] = { name: key, color, amount: 0 };
        expenseMap[key].amount += tx.totalAmount;
      }
    }

    const totalIncome = Object.values(incomeMap).reduce((s, x) => s + x.amount, 0);
    const totalExpense = Object.values(expenseMap).reduce((s, x) => s + x.amount, 0);

    res.json({
      income: Object.values(incomeMap),
      expense: Object.values(expenseMap),
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/reports/dashboard  — quick stats for dashboard cards
exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [allTx, monthTx, ledgers, recentTx] = await Promise.all([
      Transaction.find(),
      Transaction.find({ date: { $gte: startOfMonth, $lte: endOfMonth } }),
      Ledger.find(),
      Transaction.find()
        .populate("entries.ledger", "name type")
        .populate("category", "name color")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const calc = (txArr) => {
      let income = 0, expense = 0;
      for (const tx of txArr) {
        if (tx.transactionType === "income" || tx.transactionType === "pos_sale") income += tx.totalAmount;
        else if (tx.transactionType === "expense") expense += tx.totalAmount;
      }
      return { income, expense, profit: income - expense };
    };

    const all = calc(allTx);
    const month = calc(monthTx);

    res.json({
      totalIncome: all.income,
      totalExpense: all.expense,
      netProfit: all.profit,
      monthIncome: month.income,
      monthExpense: month.expense,
      monthProfit: month.profit,
      totalLedgers: ledgers.length,
      recentTransactions: recentTx,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
