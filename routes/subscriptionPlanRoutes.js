const express = require("express");
const router = express.Router();
const { getPlans, getPlanById, createPlan, updatePlan, deletePlan } = require("../controllers/subscriptionPlanController");
const { protect } = require("../middleware/authMiddleware");
const { superAdminOnly } = require("../middleware/featureMiddleware");

// Public — used for pricing page
router.get("/", getPlans);
router.get("/:id", getPlanById);

// Super Admin only
router.post("/",    protect, superAdminOnly, createPlan);
router.put("/:id",  protect, superAdminOnly, updatePlan);
router.delete("/:id", protect, superAdminOnly, deletePlan);

module.exports = router;
