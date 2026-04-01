const Transaction = require("../models/Transaction");
const Ledger = require("../models/Ledger");

// GET /api/accounting/transactions
exports.getTransactions = async (req, res) => {
  try {
    const { type, from, to, ledger, category, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (type) filter.transactionType = type;
    if (category) filter.category = category;
    if (ledger) filter["entries.ledger"] = ledger;
    if (search) filter.note = { $regex: search, $options: "i" };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }

    const total = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter)
      .populate("entries.ledger", "name type")
      .populate("category", "name color icon")
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/transactions/:id
exports.getTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id)
      .populate("entries.ledger", "name type")
      .populate("category", "name color");
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/accounting/transactions
exports.createTransaction = async (req, res) => {
  try {
    const { date, note, reference, category, transactionType, entries, totalAmount } = req.body;
    if (!entries || entries.length < 2)
      return res.status(400).json({ message: "At least 2 entries required (debit + credit)" });

    // Validate double-entry: total debits == total credits
    const totalDebit = entries.filter((e) => e.type === "debit").reduce((s, e) => s + e.amount, 0);
    const totalCredit = entries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      return res.status(400).json({ message: `Debit (${totalDebit}) must equal Credit (${totalCredit})` });

    const tx = await Transaction.create({
      date: date || new Date(),
      note: note || "",
      reference: reference || "",
      category: category || null,
      transactionType: transactionType || "journal",
      entries,
      totalAmount: totalAmount || totalDebit,
      createdBy: req.user?._id || null,
    });

    const populated = await Transaction.findById(tx._id)
      .populate("entries.ledger", "name type")
      .populate("category", "name color");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/accounting/transactions/:id
exports.deleteTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    // Reverse ledger balance changes
    const Ledger = require("../models/Ledger");
    for (const entry of tx.entries) {
      const ledger = await Ledger.findById(entry.ledger);
      if (!ledger) continue;
      if (["asset", "expense"].includes(ledger.type)) {
        ledger.currentBalance -= entry.type === "debit" ? entry.amount : -entry.amount;
      } else {
        ledger.currentBalance -= entry.type === "credit" ? entry.amount : -entry.amount;
      }
      await ledger.save();
    }

    await tx.deleteOne();
    res.json({ message: "Transaction deleted and balances reversed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/accounting/transactions/expense  — shortcut for expense entry
exports.createExpense = async (req, res) => {
  try {
    const { amount, debitLedger, creditLedger, date, note, reference, category } = req.body;
    if (!amount || !debitLedger || !creditLedger)
      return res.status(400).json({ message: "amount, debitLedger, creditLedger required" });

    const tx = await Transaction.create({
      date: date || new Date(),
      note: note || "",
      reference: reference || "",
      category: category || null,
      transactionType: "expense",
      entries: [
        { ledger: debitLedger, type: "debit", amount: Number(amount) },
        { ledger: creditLedger, type: "credit", amount: Number(amount) },
      ],
      totalAmount: Number(amount),
      createdBy: req.user?._id || null,
    });

    const populated = await Transaction.findById(tx._id)
      .populate("entries.ledger", "name type")
      .populate("category", "name color");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/accounting/transactions/income  — shortcut for income entry
exports.createIncome = async (req, res) => {
  try {
    const { amount, debitLedger, creditLedger, date, note, reference, category } = req.body;
    if (!amount || !debitLedger || !creditLedger)
      return res.status(400).json({ message: "amount, debitLedger, creditLedger required" });

    const tx = await Transaction.create({
      date: date || new Date(),
      note: note || "",
      reference: reference || "",
      category: category || null,
      transactionType: "income",
      entries: [
        { ledger: debitLedger, type: "debit", amount: Number(amount) },
        { ledger: creditLedger, type: "credit", amount: Number(amount) },
      ],
      totalAmount: Number(amount),
      createdBy: req.user?._id || null,
    });

    const populated = await Transaction.findById(tx._id)
      .populate("entries.ledger", "name type")
      .populate("category", "name color");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
