const Restaurant = require("../models/Restaurant");

/**
 * Blocks /api/accounting/* when restaurant.features.accounting === false.
 * Default (undefined) is treated as enabled.
 */
module.exports = async function accountingFeatureMiddleware(req, res, next) {
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
    if (restaurant.features && restaurant.features.accounting === false) {
      return res.status(403).json({
        message: "Accounting module is disabled for this restaurant.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};
