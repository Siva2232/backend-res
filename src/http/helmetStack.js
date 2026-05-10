const helmet = require("helmet");

function createHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
}

module.exports = { createHelmetMiddleware };
