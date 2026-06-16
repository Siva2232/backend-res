const express = require("express");
const router = express.Router();
const { protect, admin } = require("../../middleware/authMiddleware");
const {
  getSubscriptionPlans,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  activateSubscriptionHandler,
  getRestaurantPaymentHistory,
} = require("../../controllers/platform/subscriptions/subscriptionPaymentController");

router.get("/plans", getSubscriptionPlans);
router.get("/payment-history", protect, admin, getRestaurantPaymentHistory);
router.post("/create-order", protect, createSubscriptionOrder);
router.post("/verify", protect, verifySubscriptionPayment);
router.post("/activate", protect, activateSubscriptionHandler);

module.exports = router;
