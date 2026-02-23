const express = require("express");
const router = express.Router();
const { addBill, getBills } = require("../controllers/billController");
const { protect, admin } = require("../middleware/authMiddleware");

// public create route, might be used internally by order logic
router.post("/", addBill);
router.get("/", protect, admin, getBills);

module.exports = router;
