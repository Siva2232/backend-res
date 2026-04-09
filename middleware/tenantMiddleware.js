const Restaurant = require("../models/Restaurant");

// In-memory cache for validated restaurants (avoids DB hit on every request).
// Entries expire after 60 seconds so subscription/status changes propagate quickly.
const _cache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

function _getCached(rid) {
  const entry = _cache.get(rid);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(rid);
    return null;
  }
  return entry.doc;
}

function _setCache(rid, doc) {
  _cache.set(rid, { doc, ts: Date.now() });
}

/**
 * tenantMiddleware
 * ----------------
 * Reads restaurantId from:
 *   1. req.restaurantId (already set by global middleware from query/header)
 *   2. JWT payload (req.user.restaurantId) — set by authMiddleware
 *   3. Query param ?restaurantId= (public endpoints like customer menu / QR)
 *   4. X-Restaurant-Id request header
 *
 * Attaches req.restaurant (full document) so downstream controllers can use it.
 * Returns 400 if restaurantId is missing, 404 if not found, 403 if inactive/suspended.
 */
const tenantMiddleware = async (req, res, next) => {
  try {
    const restaurantId =
      req.restaurantId ||
      (req.user && req.user.restaurantId) ||
      req.query.restaurantId ||
      req.headers["x-restaurant-id"];

    if (!restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }

    const rid = String(restaurantId).toUpperCase().trim();

    // Check cache first
    let restaurant = _getCached(rid);

    if (!restaurant) {
      restaurant = await Restaurant.findOne({ restaurantId: rid }).populate("subscriptionPlan");
      if (restaurant) _setCache(rid, restaurant);
    }

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
