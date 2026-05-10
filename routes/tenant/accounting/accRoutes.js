const express = require("express");
const router = express.Router();
const { protect } = require("../../../middleware/authMiddleware");
const { tenantMiddleware } = require("../../../middleware/tenantMiddleware");
const accountingFeatureMiddleware = require("../../../middleware/accountingFeatureMiddleware");
const accController = require("../../../controllers/accAccountController");

// All routes are protected and tenant-aware
router.use(protect);
router.use(tenantMiddleware);
router.use(accountingFeatureMiddleware);

router.get("/dashboard", accController.getDashboardData);
router.get("/ledgers", accController.getLedgers);
router.get("/ledgers/:id/history", accController.getLedgerHistory);
router.post("/ledgers", accController.createLedger);
router.get("/transactions", accController.getTransactions);
router.get("/reports", accController.getReports);
router.post("/bill-payment", accController.createBillTransaction);

module.exports = router;
