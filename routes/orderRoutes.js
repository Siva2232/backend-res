const express = require("express");
const router = express.Router();
const {
  addOrderItems,
  addManualOrder,
  getOrderById,
  updateOrderStatus,
  getOrders,
  getTableOrders,
  resetTokenCount,
  getTokens,
  getOrderStats,
} = require("../controllers/orderController");
const { protect, admin, adminOrKitchen, adminOrKitchenOrWaiter } = require("../middleware/authMiddleware");

router
  .route("/")
  .post(addOrderItems)
  .get(protect, adminOrKitchenOrWaiter, getOrders);

router.route("/tokens").get(protect, adminOrKitchenOrWaiter, getTokens);
router.route("/reset-tokens").post(protect, admin, resetTokenCount);
// Aggregated dashboard stats — single fast endpoint
router.route("/stats").get(protect, admin, getOrderStats);

// dedicated manual-order endpoint, requires auth
router.post("/manual", protect, admin, addManualOrder);
router.route("/table/:tableNum").get(getTableOrders);
router.route("/:id").get(getOrderById);
router.route("/:id/status").put(protect, adminOrKitchenOrWaiter, updateOrderStatus);

module.exports = router;
