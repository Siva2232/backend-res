const { createApiLimiter } = require("../config/apiRateLimit");
const { createHelmetMiddleware } = require("./helmetStack");
const { createCorsMiddleware } = require("./corsStack");
const { applyBodyParsing } = require("./bodyParsing");
const { restaurantContextMiddleware } = require("../middleware/restaurantContext");
const { applyStaticAndRoot } = require("./staticAndRoot");

function applyGlobalMiddleware(app) {
  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware());
  applyBodyParsing(app);

  const apiLimiter = createApiLimiter();
  app.use("/api/", apiLimiter);

  app.use(restaurantContextMiddleware);
  applyStaticAndRoot(app);
}

module.exports = { applyGlobalMiddleware };
