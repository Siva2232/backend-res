const express = require("express");
const router = express.Router();
const {
  addOrderItems,
  getOrderById,
  updateOrderStatus,
  getOrders,
  getTableOrders,
} = require("../controllers/orderController");
const { protect, admin, adminOrKitchen } = require("../middleware/authMiddleware");

// orders list is now available to kitchen users as well; unauthorized
// clients will receive 403 instead of 401 (which previously caused the
// frontend to clear the login state and force a logout).
router
  .route("/")
  .post(addOrderItems)
  .get(protect, adminOrKitchen, getOrders);
router.route("/table/:tableNum").get(getTableOrders);
router.route("/:id").get(getOrderById);
router.route("/:id/status").put(protect, admin, updateOrderStatus);

module.exports = router;
