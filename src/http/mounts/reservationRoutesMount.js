const reservationRoutes = require("../../../routes/reservationRoutes");
const reservationsFeatureMiddleware = require("../../../middleware/reservationsFeatureMiddleware");
const { tenantMiddleware } = require("../../../middleware/tenantMiddleware");

function mountReservationRoutes(app) {
  app.use("/api/reservations", tenantMiddleware, reservationsFeatureMiddleware, reservationRoutes);
}

module.exports = { mountReservationRoutes };
