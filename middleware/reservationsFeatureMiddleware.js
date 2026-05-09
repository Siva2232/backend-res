const Restaurant = require("../models/Restaurant");

/**
 * Blocks /api/reservations/* when restaurant.features.reservations === false.
 * Default (undefined) is treated as enabled (backward compatible).
 */
module.exports = async function reservationsFeatureMiddleware(req, res, next) {
  try {
    const rid = req.restaurantId;
    if (!rid) return res.status(400).json({ message: "Missing restaurant context" });

    const restaurant = await Restaurant.findOne(
      { restaurantId: String(rid).toUpperCase() },
      "features"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.features && restaurant.features.reservations === false) {
      return res.status(403).json({
        message: "Reservations are disabled for this restaurant.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};
