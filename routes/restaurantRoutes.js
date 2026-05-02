const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { superAdminOnly } = require("../middleware/featureMiddleware");
const {
  getRestaurants,
  getRestaurantById,
  getRestaurantBranding,
  getRestaurantFeatures,
  createRestaurant,
  updateRestaurant,
  updateBranding,
  updateFeatures,
  assignPlan,
  recordSubscriptionPayment,
  deleteRestaurant,
  getAnalytics,
} = require("../controllers/restaurantController");

// ── Collection-level & fixed paths first (must come before :param routes) ──
router.get("/analytics/overview",    protect, superAdminOnly, getAnalytics);
router.get("/",                      protect, superAdminOnly, getRestaurants);
router.post("/",                     protect, superAdminOnly, createRestaurant);

// ── Two-segment param routes (specific before generic /:restaurantId) ─────
router.get("/:restaurantId/branding", getRestaurantBranding);          // public
router.get("/:restaurantId/features", protect, getRestaurantFeatures); // any admin
router.put("/:restaurantId/features", protect, superAdminOnly, updateFeatures);
router.put("/:restaurantId/plan",     protect, superAdminOnly, assignPlan);
router.post("/:restaurantId/subscription-payment", protect, recordSubscriptionPayment);
router.put("/:restaurantId/branding", protect, updateBranding);

// ── Single-segment param routes (must come last) ──────────────────────────
router.get("/:restaurantId",    protect, superAdminOnly, getRestaurantById);
router.put("/:restaurantId",    protect, superAdminOnly, updateRestaurant);
router.delete("/:restaurantId", protect, superAdminOnly, deleteRestaurant);

module.exports = router;
