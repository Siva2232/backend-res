const express = require("express");
const router = express.Router();
const {
  addExpense,
  getExpenses,
  deleteExpense,
} = require("../controllers/expenseController");
const { protect, admin } = require("../middleware/authMiddleware");

// all routes protected to admin only
router.route("/").get(protect, admin, getExpenses).post(protect, admin, addExpense);
router.route("/:id").delete(protect, admin, deleteExpense);

module.exports = router;
