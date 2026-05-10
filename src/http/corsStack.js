const cors = require("cors");
const { getAllowedCorsOrigins } = require("../config/env");

function createCorsMiddleware() {
  const allowedOrigins = getAllowedCorsOrigins();
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        if (process.env.NODE_ENV !== "production") return callback(null, true);
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  });
}

module.exports = { createCorsMiddleware };
