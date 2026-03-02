const express = require("express");
const router = express.Router();
const { addBill, getBills } = require("../controllers/billController");
const { protect, admin } = require("../middleware/authMiddleware");

// public create route, might be used internally by order logic
router.post("/", addBill);
// allow any authenticated staff (admin/kitchen/waiter) to view bills
// kitchen and waiter panels also need to see invoices for printing
const { adminOrKitchenOrWaiter } = require('../middleware/authMiddleware');
router.get("/", protect, adminOrKitchenOrWaiter, getBills);

module.exports = router;
