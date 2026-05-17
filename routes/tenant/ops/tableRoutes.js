const express = require("express");
const router = express.Router();
const {
  getTables,
  createTableCategory,
  deleteTableCategory,
  addTable,
  updateTable,
  removeTable,
} = require("../../../controllers/tableController");
const { protect, admin, adminOrWaiter } = require("../../../middleware/authMiddleware");

// Area routes before /:id (Floor, Outdoor, etc.)
router
  .route("/categories")
  .post(protect, adminOrWaiter, createTableCategory);
router
  .route("/categories/:id")
  .delete(protect, admin, deleteTableCategory);

router.route("/").get(getTables).post(protect, adminOrWaiter, addTable);
router
  .route("/:id")
  .patch(protect, adminOrWaiter, updateTable)
  .delete(protect, admin, removeTable);

module.exports = router;
