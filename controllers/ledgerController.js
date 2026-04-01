const Ledger = require("../models/Ledger");
const Transaction = require("../models/Transaction");

// GET /api/accounting/ledgers
exports.getLedgers = async (req, res) => {
  try {
    const { type, search } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (search) filter.name = { $regex: search, $options: "i" };
    const ledgers = await Ledger.find(filter).sort({ name: 1 });
    res.json(ledgers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/ledgers/:id
exports.getLedger = async (req, res) => {
  try {
    const ledger = await Ledger.findById(req.params.id);
    if (!ledger) return res.status(404).json({ message: "Ledger not found" });
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/accounting/ledgers
exports.createLedger = async (req, res) => {
  try {
    const { name, type, group, openingBalance, description } = req.body;
    if (!name || !type) return res.status(400).json({ message: "Name and type required" });
    const ledger = await Ledger.create({
      name,
      type,
      group: group || "",
      openingBalance: openingBalance || 0,
      currentBalance: openingBalance || 0,
      description: description || "",
    });
    res.status(201).json(ledger);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/accounting/ledgers/:id
exports.updateLedger = async (req, res) => {
  try {
    const ledger = await Ledger.findById(req.params.id);
    if (!ledger) return res.status(404).json({ message: "Ledger not found" });
    if (ledger.isSystem) return res.status(400).json({ message: "System ledgers cannot be modified" });
    const { name, type, group, description, isActive } = req.body;
    if (name) ledger.name = name;
    if (type) ledger.type = type;
    if (group !== undefined) ledger.group = group;
    if (description !== undefined) ledger.description = description;
    if (isActive !== undefined) ledger.isActive = isActive;
    await ledger.save();
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/accounting/ledgers/:id
exports.deleteLedger = async (req, res) => {
  try {
    const ledger = await Ledger.findById(req.params.id);
    if (!ledger) return res.status(404).json({ message: "Ledger not found" });
    if (ledger.isSystem) return res.status(400).json({ message: "System ledgers cannot be deleted" });
    // check if in use
    const inUse = await Transaction.findOne({ "entries.ledger": ledger._id });
    if (inUse) return res.status(400).json({ message: "Ledger has transactions and cannot be deleted" });
    await ledger.deleteOne();
    res.json({ message: "Ledger deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/accounting/ledgers/:id/statement
exports.getLedgerStatement = async (req, res) => {
  try {
    const { from, to } = req.query;
    const ledger = await Ledger.findById(req.params.id);
    if (!ledger) return res.status(404).json({ message: "Ledger not found" });

    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(new Date(to).setHours(23, 59, 59));

    const txFilter = { "entries.ledger": ledger._id };
    if (from || to) txFilter.date = dateFilter;

    const transactions = await Transaction.find(txFilter)
      .populate("entries.ledger", "name type")
      .populate("category", "name color")
      .sort({ date: -1 });

    // compute running balance
    let running = ledger.openingBalance;
    const enriched = transactions.reverse().map((tx) => {
      const entry = tx.entries.find((e) => String(e.ledger._id || e.ledger) === String(ledger._id));
      const isDebit = entry?.type === "debit";
      if (["asset", "expense"].includes(ledger.type)) {
        running += isDebit ? entry.amount : -entry.amount;
      } else {
        running += isDebit ? -entry.amount : entry.amount;
      }
      return { ...tx.toObject(), entryType: entry?.type, entryAmount: entry?.amount, runningBalance: running };
    });

    res.json({ ledger, transactions: enriched.reverse(), openingBalance: ledger.openingBalance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
