const rateLimit = require("express-rate-limit");

/**
 * Single limiter for all `/api/*` traffic (avoids stacking multiple limiters per IP).
 */
function createApiLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 600 : 3000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests from this IP, please try again shortly." },
  });
}

module.exports = { createApiLimiter };
