const express = require("express");
const router = express.Router();
const { protect, admin } = require("../../../middleware/authMiddleware");
const {
  getPaymentConfig,
  getPaymentConfigAdmin,
  updatePaymentConfig,
  testPaymentConfig,
  createCustomerOrder,
  verifyCustomerPayment,
} = require("../../../controllers/tenant/payments/paymentController");

router.get("/config", getPaymentConfig);
router.get("/config/admin", protect, admin, getPaymentConfigAdmin);
router.put("/config", protect, admin, updatePaymentConfig);
router.post("/config/test", protect, admin, testPaymentConfig);
router.post("/create-order", createCustomerOrder);
router.post("/verify", verifyCustomerPayment);

module.exports = router;
