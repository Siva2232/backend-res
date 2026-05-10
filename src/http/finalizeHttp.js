const { notFound, errorHandler } = require("../../middleware/errorMiddleware");

function applyErrorHandlers(app) {
  app.use(notFound);
  app.use(errorHandler);
}

module.exports = { applyErrorHandlers };
