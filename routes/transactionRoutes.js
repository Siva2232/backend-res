const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getTransactions, getTransaction, createTransaction, deleteTransaction,
  createExpense, createIncome,
} = require("../controllers/transactionController");

router.use(protect);

router.route("/").get(getTransactions).post(admin, createTransaction);
router.route("/:id").get(getTransaction).delete(admin, deleteTransaction);
router.post("/expense", admin, createExpense);
router.post("/income", admin, createIncome);

module.exports = router;
