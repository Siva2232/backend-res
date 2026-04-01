const express = require("express");
const router = express.Router();
const { authUser, registerUser, getUsers, updateUser, deleteUser } = require("../controllers/authController");

router.post("/login", authUser);
router.post("/register", registerUser);

// list all users (admin only)
router.get("/users", require("../middleware/authMiddleware").protect, require("../middleware/authMiddleware").admin, getUsers);

// update user
router.put("/users/:id", require("../middleware/authMiddleware").protect, require("../middleware/authMiddleware").admin, updateUser);
// delete user
router.delete("/users/:id", require("../middleware/authMiddleware").protect, require("../middleware/authMiddleware").admin, deleteUser);

module.exports = router;
