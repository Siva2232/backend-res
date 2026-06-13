const authRoutes = require("../../routes/authRoutes");
const supportTicketRoutes = require("../../routes/supportTicketRoutes");
const printJobRoutes = require("../../routes/printJobRoutes");
const connectorRegisterRoutes = require("../../routes/connectorRegisterRoutes");
const connectorRoutes = require("../../routes/connectorRoutes");
const printLockRoutes = require("../../routes/printLockRoutes");

function mountAuthAndSupportRoutes(app) {
  app.use("/api/auth", authRoutes);
  app.use("/api/support-tickets", supportTicketRoutes);
  app.use("/api/print-jobs", printJobRoutes);
  app.use("/api/connector", connectorRegisterRoutes);
  app.use("/api/connectors", connectorRoutes);
  app.use("/api/print", printLockRoutes);
}

module.exports = { mountAuthAndSupportRoutes };
