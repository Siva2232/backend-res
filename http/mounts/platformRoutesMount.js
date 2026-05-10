const restaurantRoutes = require("../../routes/restaurantRoutes");
const subscriptionPlanRoutes = require("../../routes/subscriptionPlanRoutes");
const superAdminRoutes = require("../../routes/superAdminRoutes");
const saNotificationRoutes = require("../../routes/saNotificationRoutes");
const accRoutes = require("../../routes/accRoutes");

function mountPlatformRoutes(app) {
  app.use("/api/restaurants", restaurantRoutes);
  app.use("/api/plans", subscriptionPlanRoutes);
  app.use("/api/superadmin", superAdminRoutes);
  app.use("/api/sa-notifications", saNotificationRoutes);
  app.use("/api/accounting", accRoutes);
}

module.exports = { mountPlatformRoutes };
