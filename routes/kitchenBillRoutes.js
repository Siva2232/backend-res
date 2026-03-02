const express = require("express");
const router = express.Router();
const {
  getKitchenBills,
  getKitchenBillsByOrder,
  getKitchenBillsByTable,
  updateKitchenBillStatus,
  getActiveKitchenBills,
} = require("../controllers/kitchenBillController");

// Get all kitchen bills
router.get("/", getKitchenBills);

// Get active (non-served) kitchen bills
router.get("/active", getActiveKitchenBills);

// Get kitchen bills for a specific order
router.get("/order/:orderId", getKitchenBillsByOrder);

// Get kitchen bills for a specific table
router.get("/table/:tableNum", getKitchenBillsByTable);

// Update kitchen bill status
router.put("/:id/status", updateKitchenBillStatus);

module.exports = router;
