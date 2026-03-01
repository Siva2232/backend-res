const Expense = require("../models/Expense");

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private/Admin (login check handled elsewhere)
const addExpense = async (req, res) => {
  const { date, desc, amount, category } = req.body;
  if (!date || !desc || !amount || !category) {
    res.status(400).json({ message: "Missing required fields" });
    return;
  }
  try {
    const exp = new Expense({ date, desc, amount, category });
    const created = await exp.save();
    res.status(201).json(created);
  } catch (err) {
    console.error("addExpense error", err);
    res.status(500).json({ message: "Server error creating expense" });
  }
};

// @desc    Get expenses, optional ?category=purchase
// @route   GET /api/expenses
// @access  Private/Admin
const getExpenses = async (req, res) => {
  try {
    const query = {};
    if (req.query.category) {
      query.category = req.query.category;
    }
    const expenses = await Expense.find(query).sort({ date: -1 }).lean();
    res.json(expenses);
  } catch (err) {
    console.error("getExpenses error", err);
    res.status(500).json({ message: "Server error fetching expenses" });
  }
};

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private/Admin
const deleteExpense = async (req, res) => {
  try {
    const exp = await Expense.findById(req.params.id);
    if (!exp) {
      res.status(404).json({ message: "Expense not found" });
      return;
    }
    await exp.remove();
    res.json({ message: "Expense removed" });
  } catch (err) {
    console.error("deleteExpense error", err);
    res.status(500).json({ message: "Server error deleting expense" });
  }
};

module.exports = {
  addExpense,
  getExpenses,
  deleteExpense,
};
