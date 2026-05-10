const orderRoutes = require("../../../routes/orderRoutes");
const billRoutes = require("../../../routes/billRoutes");
const kitchenBillRoutes = require("../../../routes/kitchenBillRoutes");
const tableRoutes = require("../../../routes/tableRoutes");
const notificationRoutes = require("../../../routes/notificationRoutes");
const paymentRoutes = require("../../../routes/paymentRoutes");
const { tenantMiddleware } = require("../../../middleware/tenantMiddleware");

function mountOperationsRoutes(app) {
  app.use("/api/orders", tenantMiddleware, orderRoutes);
  app.use("/api/bills", tenantMiddleware, billRoutes);
  app.use("/api/kitchen-bills", tenantMiddleware, kitchenBillRoutes);
  app.use("/api/tables", tenantMiddleware, tableRoutes);
  app.use("/api/notifications", tenantMiddleware, notificationRoutes);
  app.use("/api/payment", tenantMiddleware, paymentRoutes);
  app.use("/api/payments", tenantMiddleware, paymentRoutes);
}

module.exports = { mountOperationsRoutes };
