const express = require("express");
const router = express.Router();
const {
  getSubItems,
  createSubItem,
  updateSubItem,
  deleteSubItem,
} = require("../controllers/subItemController");
const { protect, admin } = require("../middleware/authMiddleware");

router.route("/").get(getSubItems).post(protect, admin, createSubItem);
router.route("/:id").put(protect, admin, updateSubItem).delete(protect, admin, deleteSubItem);

module.exports = router;
