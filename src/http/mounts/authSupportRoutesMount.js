const authRoutes = require("../../../routes/authRoutes");
const supportTicketRoutes = require("../../../routes/supportTicketRoutes");

function mountAuthAndSupportRoutes(app) {
  app.use("/api/auth", authRoutes);
  app.use("/api/support-tickets", supportTicketRoutes);
}

module.exports = { mountAuthAndSupportRoutes };
