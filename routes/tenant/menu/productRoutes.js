const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustProductStock,
} = require("../../../controllers/productController");
const { protect, admin } = require("../../../middleware/authMiddleware");

router.route("/").get(getProducts).post(protect, admin, createProduct);
router.patch("/:id/stock", protect, admin, adjustProductStock);
router
  .route("/:id")
  .get(getProductById)
  .put(protect, admin, updateProduct)
  .delete(protect, admin, deleteProduct);

module.exports = router;
