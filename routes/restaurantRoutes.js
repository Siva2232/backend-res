const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { superAdminOnly } = require("../middleware/featureMiddleware");
const {
  getRestaurants,
  getRestaurantById,
  getRestaurantBranding,
  createRestaurant,
  updateRestaurant,
  updateBranding,
  updateFeatures,
  assignPlan,
  deleteRestaurant,
  getAnalytics,
} = require("../controllers/restaurantController");

// Public — used on login to inject theme
router.get("/:restaurantId/branding", getRestaurantBranding);

// Super Admin only
router.get("/analytics/overview", protect, superAdminOnly, getAnalytics);
router.get("/",                    protect, superAdminOnly, getRestaurants);
router.post("/",                   protect, superAdminOnly, createRestaurant);
router.get("/:restaurantId",       protect, superAdminOnly, getRestaurantById);
router.put("/:restaurantId",       protect, superAdminOnly, updateRestaurant);
router.delete("/:restaurantId",    protect, superAdminOnly, deleteRestaurant);

// Features & Plan — Super Admin only
router.put("/:restaurantId/features", protect, superAdminOnly, updateFeatures);
router.put("/:restaurantId/plan",     protect, superAdminOnly, assignPlan);

// Branding — Super Admin OR own Restaurant Admin (protect validates token; 
// controller can restrict by role if needed)
router.put("/:restaurantId/branding", protect, updateBranding);

module.exports = router;
