const { mountCatalogRoutes } = require("./catalogRoutes");
const { mountOperationsRoutes } = require("./operationsRoutes");
const { mountReservationRoutes } = require("./reservationRoutesMount");
const { mountAuthAndSupportRoutes } = require("./authSupportRoutesMount");
const { mountHrRoutes } = require("./hrRoutesMount");
const { mountPlatformRoutes } = require("./platformRoutesMount");

/**
 * Registers all `/api/*` routers in a stable order (matches former monolithic createApp).
 */
function mountAllApiRoutes(app) {
  mountCatalogRoutes(app);
  mountOperationsRoutes(app);
  mountReservationRoutes(app);
  mountAuthAndSupportRoutes(app);
  mountHrRoutes(app);
  mountPlatformRoutes(app);
}

module.exports = { mountAllApiRoutes };
