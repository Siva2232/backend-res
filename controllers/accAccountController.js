const { getModel } = require("../utils/getModel");
const AccLedgerBase = require("../models/AccLedger");
const AccTransactionBase = require("../models/AccTransaction");

const ensureBaseLedgers = async (restaurantId) => {
  const LedgerModel = await getModel("AccLedger", AccLedgerBase.schema, restaurantId);
  const baseLedgers = [
    { name: "Cash", type: "asset", code: "CASH_001", isDefault: true },
    { name: "Bank", type: "asset", code: "BANK_001", isDefault: true },
    { name: "Sales", type: "income", code: "SALES_001", isDefault: true },
    { name: "Discount", type: "expense", code: "DISC_001", isDefault: true },
    { name: "Customer Balance", type: "liability", code: "BAL_001", isDefault: true },
  ];

  for (const ledger of baseLedgers) {
    const existing = await LedgerModel.findOne({ code: ledger.code });
    if (!existing) {
      await LedgerModel.create({ ...ledger, restaurantId });
    }
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    const rid = req.restaurantId;
    const LedgerModel = await getModel("AccLedger", AccLedgerBase.schema, rid);
    const TransactionModel = await getModel("AccTransaction", AccTransactionBase.schema, rid);

    await ensureBaseLedgers(rid);

    const transactions = await TransactionModel.find().populate("entries.ledger");

    let cashBalance = 0;
    let bankBalance = 0;
    let totalSales = 0;
    let totalExpenses = 0;

    for (const tx of transactions) {
      for (const entry of tx.entries) {
        const ledger = entry.ledger;
        if (!ledger) continue;

        if (ledger.code === "CASH_001") {
          cashBalance += entry.type === "debit" ? entry.amount : -entry.amount;
        } else if (ledger.code === "BANK_001") {
          bankBalance += entry.type === "debit" ? entry.amount : -entry.amount;
        }

        if (ledger.type === "income") {
          totalSales += entry.type === "credit" ? entry.amount : -entry.amount;
        }
        if (ledger.type === "expense") {
          totalExpenses += entry.type === "debit" ? entry.amount : -entry.amount;
        }
      }
    }

    return res.json({
      cashBalance,
      bankBalance,
      totalSales,
      totalExpenses,
      profit: totalSales - totalExpenses,
    });
  } catch (error) {
    console.error("Accounting Dashboard Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getLedgers = async (req, res) => {
  try {
    const LedgerModel = await getModel("AccLedger", AccLedgerBase.schema, req.restaurantId);
    const ledgers = await LedgerModel.find().sort({ name: 1 });
    res.json(ledgers);
  } catch (error) {
    console.error("Get Ledgers Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.createLedger = async (req, res) => {
  try {
    const LedgerModel = await getModel("AccLedger", AccLedgerBase.schema, req.restaurantId);
    const ledger = await LedgerModel.create({ ...req.body, restaurantId: req.restaurantId });
    res.status(201).json(ledger);
  } catch (error) {
    console.error("Create Ledger Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const TransactionModel = await getModel("AccTransaction", AccTransactionBase.schema, req.restaurantId);
    const transactions = await TransactionModel.find().populate("entries.ledger").sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    console.error("Get Transactions Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getLedgerHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const LedgerModel = await getModel("AccLedger", AccLedgerBase.schema, req.restaurantId);
    const TransactionModel = await getModel("AccTransaction", AccTransactionBase.schema, req.restaurantId);

    const ledger = await LedgerModel.findById(id);
    if (!ledger) {
      return res.status(404).json({ message: "Ledger not found" });
    }

    const transactions = await TransactionModel.find({ "entries.ledger": ledger._id })
      .populate("entries.ledger")
      .sort({ date: -1 });

    res.json({ ledger, transactions });
  } catch (error) {
    console.error("Get Ledger History Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.createBillTransaction = async (req, res) => {
  try {
    const { billId, cash = 0, bank = 0, discount = 0, balance = 0, total, description } = req.body;
    const rid = req.restaurantId;

    const netPaid = Number(cash) + Number(bank) + Number(discount) - Number(balance);
    if (Number(netPaid) < 0 || Math.abs(netPaid - Number(total)) > 0.01) {
      return res.status(400).json({ message: "Invalid payment totals. Net payment must equal bill total." });
    }

    const LedgerModel = await getModel("AccLedger", AccLedgerBase.schema, rid);
    const TransactionModel = await getModel("AccTransaction", AccTransactionBase.schema, rid);

    await ensureBaseLedgers(rid);

    const cashLedger = await LedgerModel.findOne({ code: "CASH_001" });
    const bankLedger = await LedgerModel.findOne({ code: "BANK_001" });
    const salesLedger = await LedgerModel.findOne({ code: "SALES_001" });
    const discountLedger = await LedgerModel.findOne({ code: "DISC_001" });
    const balanceLedger = await LedgerModel.findOne({ code: "BAL_001" });

    if (!cashLedger || !bankLedger || !salesLedger || !discountLedger || !balanceLedger) {
      return res.status(500).json({ message: "Required accounting ledgers are not initialized" });
    }

    const entries = [];
    if (Number(cash) > 0) entries.push({ ledger: cashLedger._id, type: "debit", amount: Number(cash) });
    if (Number(bank) > 0) entries.push({ ledger: bankLedger._id, type: "debit", amount: Number(bank) });
    if (Number(discount) > 0) entries.push({ ledger: discountLedger._id, type: "debit", amount: Number(discount) });

    entries.push({ ledger: salesLedger._id, type: "credit", amount: Number(total) });

    if (Number(balance) > 0) {
      entries.push({ ledger: balanceLedger._id, type: "credit", amount: Number(balance) });
    }

    const transaction = await TransactionModel.create({
      date: new Date(),
      description: description || `Payment for Bill #${billId}`,
      referenceId: billId,
      referenceType: "Bill",
      entries,
      restaurantId: rid,
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Create Bill Transaction Error:", error);
    res.status(500).json({ message: error.message });
  }
};
