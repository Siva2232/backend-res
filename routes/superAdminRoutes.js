const express = require("express");
const router = express.Router();
const {
  superAdminLogin,
  superAdminRegister,
  getSuperAdminProfile,
} = require("../controllers/superAdminController");
const { protect } = require("../middleware/authMiddleware");
const { superAdminOnly } = require("../middleware/featureMiddleware");

router.post("/login",    superAdminLogin);
router.post("/register", superAdminRegister); // locked after first SA
router.get("/me",        protect, superAdminOnly, getSuperAdminProfile);

module.exports = router;
