const RecurringTransaction = require("../models/RecurringTransaction");
const Transaction = require("../models/Transaction");

exports.getRecurring = async (req, res) => {
  try {
    const list = await RecurringTransaction.find()
      .populate("debitLedger", "name type")
      .populate("creditLedger", "name type")
      .populate("category", "name color");
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createRecurring = async (req, res) => {
  try {
    const { name, transactionType, amount, debitLedger, creditLedger, category, note, frequency, dayOfMonth } = req.body;
    if (!name || !amount || !debitLedger || !creditLedger)
      return res.status(400).json({ message: "name, amount, debitLedger, creditLedger required" });

    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth || 1);
    if (next <= now) next.setMonth(next.getMonth() + 1);

    const rec = await RecurringTransaction.create({
      name, transactionType, amount, debitLedger, creditLedger,
      category: category || null, note, frequency: frequency || "monthly",
      dayOfMonth: dayOfMonth || 1, nextRunDate: next,
    });
    res.status(201).json(rec);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateRecurring = async (req, res) => {
  try {
    const rec = await RecurringTransaction.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!rec) return res.status(404).json({ message: "Not found" });
    res.json(rec);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRecurring = async (req, res) => {
  try {
    await RecurringTransaction.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Called by cron — process all due recurring transactions
exports.processRecurring = async () => {
  const now = new Date();
  const due = await RecurringTransaction.find({ isActive: true, nextRunDate: { $lte: now } });
  let count = 0;
  for (const rec of due) {
    await Transaction.create({
      date: now,
      note: rec.note || rec.name,
      transactionType: rec.transactionType,
      category: rec.category,
      entries: [
        { ledger: rec.debitLedger, type: "debit", amount: rec.amount },
        { ledger: rec.creditLedger, type: "credit", amount: rec.amount },
      ],
      totalAmount: rec.amount,
      isRecurring: true,
      recurringId: rec._id,
    });
    // Update next run date
    const next = new Date(rec.nextRunDate);
    if (rec.frequency === "daily") next.setDate(next.getDate() + 1);
    else if (rec.frequency === "weekly") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    rec.lastRunDate = now;
    rec.nextRunDate = next;
    await rec.save();
    count++;
  }
  console.log(`[Accounting Cron] Processed ${count} recurring transactions`);
};
