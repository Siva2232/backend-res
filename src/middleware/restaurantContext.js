const jwt = require("jsonwebtoken");

/**
 * Sets `req.restaurantId` from query, `x-restaurant-id`, or JWT payload (non-throwing).
 */
function restaurantContextMiddleware(req, res, next) {
  const rid = req.query.restaurantId || req.headers["x-restaurant-id"];
  if (rid) {
    req.restaurantId = String(rid).toUpperCase().trim();
  }

  if (!req.restaurantId) {
    try {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith("Bearer ")) {
        const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
        if (decoded.restaurantId) {
          req.restaurantId = String(decoded.restaurantId).toUpperCase().trim();
        }
      }
    } catch (_) {
      /* invalid / expired token — ignore */
    }
  }

  next();
}

module.exports = { restaurantContextMiddleware };
