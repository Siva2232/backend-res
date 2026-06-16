const restaurantRoutes = require("../../routes/restaurantRoutes");
const subscriptionPlanRoutes = require("../../routes/subscriptionPlanRoutes");
const subscriptionPaymentRoutes = require("../../routes/subscriptionPaymentRoutes");
const platformPaymentRoutes = require("../../routes/platformPaymentRoutes");
const superAdminRoutes = require("../../routes/superAdminRoutes");
const saNotificationRoutes = require("../../routes/saNotificationRoutes");
const accRoutes = require("../../routes/accRoutes");

function mountPlatformRoutes(app) {
  app.use("/api/restaurants", restaurantRoutes);
  app.use("/api/plans", subscriptionPlanRoutes);
  app.use("/api/subscriptions", subscriptionPaymentRoutes);
  app.use("/api/superadmin/platform-payments", platformPaymentRoutes);
  app.use("/api/superadmin", superAdminRoutes);
  app.use("/api/sa-notifications", saNotificationRoutes);
  app.use("/api/accounting", accRoutes);
}

module.exports = { mountPlatformRoutes };
