/**
 * featureMiddleware
 * -----------------
 * Factory function — returns a middleware that checks whether a specific feature
 * is enabled for the current restaurant (req.restaurant.features).
 *
 * Usage (in routes):
 *   router.use(protect, tenantMiddleware, requireFeature('hr'), hrRoutes);
 *   router.get('/orders', protect, tenantMiddleware, requireFeature('onlineOrders'), handler);
 */
const requireFeature = (featureName) => (req, res, next) => {
  if (!req.restaurant) {
    return res.status(400).json({ message: "Tenant context missing. Apply tenantMiddleware first." });
  }

  const enabled = req.restaurant.features && req.restaurant.features[featureName];
  if (!enabled) {
    return res.status(403).json({
      message: `Feature '${featureName}' is not enabled for your subscription plan.`,
    });
  }

  next();
};

/**
 * superAdminOnly
 * --------------
 * Ensures the requesting user is a Super Admin (role === 'superadmin').
 * Must be used AFTER the protect middleware.
 */
const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === "superadmin") {
    return next();
  }
  return res.status(403).json({ message: "Super Admin access required" });
};

module.exports = { requireFeature, superAdminOnly };
