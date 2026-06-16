const express = require("express");
const router = express.Router();
const {
  superAdminLogin,
  superAdminRegister,
  getSuperAdminProfile,
  updateSuperAdminProfile,
  changeSuperAdminPassword,
} = require("../../controllers/superAdminController");
const { getSnapshot, askRobot } = require("../../controllers/platform/analyticsRobotController");
const { protect } = require("../../middleware/authMiddleware");
const { superAdminOnly } = require("../../middleware/featureMiddleware");

router.post("/login",    superAdminLogin);
router.post("/register", superAdminRegister); // locked after first SA
router.get("/me",        protect, superAdminOnly, getSuperAdminProfile);
router.put("/profile", protect, superAdminOnly, updateSuperAdminProfile);
router.put("/profile/password", protect, superAdminOnly, changeSuperAdminPassword);
router.get("/analytics-robot/snapshot", protect, superAdminOnly, getSnapshot);
router.post("/analytics-robot/ask", protect, superAdminOnly, askRobot);

module.exports = router;
