/**
 * HTTP layer barrel — optional entry for tests or custom builds that reuse pieces of the stack.
 */
module.exports = {
  applyTrustProxy: require("./trustProxy").applyTrustProxy,
  applyHardening: require("./hardening").applyHardening,
  applyGlobalMiddleware: require("./applyGlobalMiddleware").applyGlobalMiddleware,
  mountAllApiRoutes: require("./mounts").mountAllApiRoutes,
  applyErrorHandlers: require("./finalizeHttp").applyErrorHandlers,
};
