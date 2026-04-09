const Restaurant = require("../models/Restaurant");

/**
 * tenantMiddleware
 * ----------------
 * Reads restaurantId from:
 *   1. JWT payload (req.user.restaurantId) — set by authMiddleware
 *   2. Query param ?restaurantId= (public endpoints like customer menu / QR)
 *   3. X-Restaurant-Id request header
 *
 * Attaches req.restaurant (full document) so downstream controllers can use it.
 * Returns 400 if restaurantId is missing, 404 if not found, 403 if inactive/suspended.
 */
const tenantMiddleware = async (req, res, next) => {
  try {
    const restaurantId =
      (req.user && req.user.restaurantId) ||
      req.query.restaurantId ||
      req.headers["x-restaurant-id"];

    if (!restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }

    const restaurant = await Restaurant.findOne({
      restaurantId: String(restaurantId).toUpperCase(),
    }).populate("subscriptionPlan");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (!restaurant.isActive || restaurant.subscriptionStatus === "suspended") {
      return res.status(403).json({ message: "Restaurant account is suspended" });
    }

    // Attach to request for use in controllers
    req.restaurant = restaurant;
    req.restaurantId = restaurant.restaurantId;
    return next();
  } catch (err) {
    console.error("[tenantMiddleware] error:", err.message);
    res.status(500).json({ message: "Tenant resolution failed" });
  }
};

module.exports = { tenantMiddleware };
