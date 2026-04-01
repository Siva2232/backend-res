const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getSummary, getMonthlyReport, getCashFlow, getProfitLoss, getDashboardStats,
} = require("../controllers/reportController");

router.use(protect);
router.get("/summary", getSummary);
router.get("/monthly", getMonthlyReport);
router.get("/cashflow", getCashFlow);
router.get("/pl", getProfitLoss);
router.get("/dashboard", getDashboardStats);

module.exports = router;
