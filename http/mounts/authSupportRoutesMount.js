const authRoutes = require("../../routes/authRoutes");
const supportTicketRoutes = require("../../routes/supportTicketRoutes");
const printJobRoutes = require("../../routes/printJobRoutes");

function mountAuthAndSupportRoutes(app) {
  app.use("/api/auth", authRoutes);
  app.use("/api/support-tickets", supportTicketRoutes);
  app.use("/api/print-jobs", printJobRoutes);
}

module.exports = { mountAuthAndSupportRoutes };
