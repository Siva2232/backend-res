const express = require("express");
const router = express.Router();
const {
  getTables,
  addTable,
  removeTable,
} = require("../controllers/tableController");
// Assuming there is a protect/admin middleware in authMiddleware.js
const { protect, admin } = require("../middleware/authMiddleware");

// In this simple setup, everyone has access to GET (needed for customer choosing mode), 
// but others are protected/admin
router.route("/").get(getTables).post(protect, admin, addTable);
router.route("/:id").delete(protect, admin, removeTable);

module.exports = router;
