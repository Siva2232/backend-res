const express = require("express");
const router = express.Router();
const { authUser, registerUser, getUsers, updateUser, deleteUser, createSupportUser, getSupportUsers, getProfile, updateProfile } = require("../controllers/authController");
const { protect, admin } = require("../middleware/authMiddleware");

router.post("/login", authUser);
router.post("/register", registerUser);

// Profile routes (Any role)
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

// list all users (admin only)
router.get("/users", protect, admin, getUsers);

// support team management (superadmin only)
router.post("/support-team", require("../middleware/authMiddleware").protect, (req, res, next) => {
  if (req.user.role === "superadmin") return next();
  res.status(403).json({ message: "Not authorized" });
}, createSupportUser);
router.get("/support-team", require("../middleware/authMiddleware").protect, (req, res, next) => {
  if (req.user.role === "superadmin") return next();
  res.status(403).json({ message: "Not authorized" });
}, getSupportUsers);

// update user
router.put("/users/:id", require("../middleware/authMiddleware").protect, require("../middleware/authMiddleware").admin, updateUser);
// delete user
router.delete("/users/:id", require("../middleware/authMiddleware").protect, require("../middleware/authMiddleware").admin, deleteUser);

module.exports = router;
