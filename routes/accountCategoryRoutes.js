const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  getCategories, createCategory, updateCategory, deleteCategory,
} = require("../controllers/accountCategoryController");

router.use(protect);
router.route("/").get(getCategories).post(admin, createCategory);
router.route("/:id").put(admin, updateCategory).delete(admin, deleteCategory);

module.exports = router;
