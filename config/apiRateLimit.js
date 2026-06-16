const rateLimit = require("express-rate-limit");

/**
 * Single limiter for all `/api/*` traffic (avoids stacking multiple limiters per IP).
 */
function createApiLimiter() {
  const envMax = parseInt(process.env.API_RATE_LIMIT_MAX || "", 10);
  const effectiveMax = Number.isFinite(envMax) && envMax > 0
    ? envMax
    : process.env.NODE_ENV === "production"
      ? 600
      : 3000;

  return rateLimit({
    windowMs: 60 * 1000,
    max: effectiveMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests from this IP, please try again shortly." },
  });
}

/** Stricter limiter for forgot-password OTP requests */
function createForgotPasswordOtpLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many OTP requests. Please try again in 15 minutes." },
  });
}

module.exports = { createApiLimiter, createForgotPasswordOtpLimiter };
