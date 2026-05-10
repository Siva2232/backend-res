/**
 * Startup validation and typed-ish env helpers for production.
 */
function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.MONGO_URI) {
    console.error("[bootstrap] FATAL: MONGO_URI is required in production.");
    process.exit(1);
  }
  const jwt = process.env.JWT_SECRET || "";
  if (jwt.length < 16) {
    console.warn(
      "[bootstrap] WARN: JWT_SECRET should be a long random string (16+ chars) in production."
    );
  }
}

/**
 * CORS allow-list: comma-separated origins in CORS_ORIGINS, merged with defaults.
 * Example: CORS_ORIGINS=https://app.example.com,https://admin.example.com
 */
function getAllowedCorsOrigins() {
  const defaults = [
    "https://restowebtests.netlify.app",
    "https://restowebtest.netlify.app",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
  const extra = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...defaults, ...extra])];
}

module.exports = { validateProductionEnv, getAllowedCorsOrigins };
