const express = require("express");

const { applyTrustProxy } = require("./http/trustProxy");
const { applyHardening } = require("./http/hardening");
const { applyWebhookRawBody } = require("./http/webhookRawBody");
const { applyGlobalMiddleware } = require("./http/applyGlobalMiddleware");
const { mountAllApiRoutes } = require("./http/mounts");
const { applyErrorHandlers } = require("./http/finalizeHttp");

/**
 * Build configured Express application (no HTTP listen, no Socket.IO).
 */
function createApp() {
  const app = express();

  applyTrustProxy(app);
  applyHardening(app);
  applyWebhookRawBody(app);
  applyGlobalMiddleware(app);
  mountAllApiRoutes(app);
  applyErrorHandlers(app);

  return app;
}

module.exports = { createApp };
