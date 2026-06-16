const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");
const { superAdminOnly } = require("../../middleware/featureMiddleware");
const {
  getPlatformPaymentSettings,
  updatePlatformPaymentSettings,
  testPlatformPaymentSettings,
  getAllPaymentHistory,
} = require("../../controllers/platform/platformPaymentController");

router.get("/settings", protect, superAdminOnly, getPlatformPaymentSettings);
router.put("/settings", protect, superAdminOnly, updatePlatformPaymentSettings);
router.post("/settings/test", protect, superAdminOnly, testPlatformPaymentSettings);
router.get("/history", protect, superAdminOnly, getAllPaymentHistory);

module.exports = router;
