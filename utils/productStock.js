/** Apply trackStock rules: when tracking, availability follows quantity. */
function resolveProductStockFields({ trackStock, stock, isAvailable, existing }) {
  const tracks = trackStock !== undefined ? Boolean(trackStock) : Boolean(existing?.trackStock);
  const qty =
    stock !== undefined
      ? Math.max(0, Math.floor(Number(stock) || 0))
      : Math.max(0, Math.floor(Number(existing?.stock) || 0));

  let available = isAvailable;
  if (available === undefined && existing?.isAvailable !== undefined) {
    available = existing.isAvailable;
  }
  if (available === undefined) available = true;

  if (tracks) {
    available = qty > 0;
  }

  return { trackStock: tracks, stock: qty, isAvailable: available };
}

/** Aggregate qty per product id from order line items. */
function aggregateQtyByProduct(items = []) {
  const map = new Map();
  for (const item of items) {
    const id = item.product?._id || item.product || item._id;
    if (!id) continue;
    const key = String(id);
    const qty = Math.max(0, Number(item.qty) || 1);
    map.set(key, (map.get(key) || 0) + qty);
  }
  return map;
}

/**
 * Decrement stock for tracked products after an order. Emits productUpdated per change.
 * @returns {Promise<object[]>} updated products
 */
async function deductStockForOrderItems(req, items = []) {
  const ProductModel = require("../models/Product");
  const { getModel } = require("./getModel");
  const Product = await getModel("Product", ProductModel.schema, req.restaurantId);
  const byProduct = aggregateQtyByProduct(items);
  if (byProduct.size === 0) return [];

  const io = req.app.get("io");
  const updated = [];

  for (const [productId, qty] of byProduct.entries()) {
    const product = await Product.findById(productId);
    if (!product || !product.trackStock) continue;

    const nextStock = Math.max(0, (Number(product.stock) || 0) - qty);
    product.stock = nextStock;
    product.isAvailable = nextStock > 0;
    await product.save();
    updated.push(product.toObject ? product.toObject() : product);

    if (io) {
      io.to(req.restaurantId).emit("productUpdated", product);
    }
  }

  if (updated.length && io) {
    io.to(req.restaurantId).emit("productsUpdated");
  }

  return updated;
}

module.exports = {
  resolveProductStockFields,
  aggregateQtyByProduct,
  deductStockForOrderItems,
};
