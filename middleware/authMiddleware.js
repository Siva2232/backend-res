const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not defined in environment");
      return res.status(500).json({ message: "Authentication misconfigured" });
    }

    const verifyToken = (tokenToVerify) => {
      try {
        return jwt.verify(tokenToVerify, process.env.JWT_SECRET);
      } catch (err) {
        if (process.env.JWT_SECRET_OLD) {
          try {
            return jwt.verify(tokenToVerify, process.env.JWT_SECRET_OLD);
          } catch (oldErr) {
            // continue to throw the original error for clarity
          }
        }
        throw err;
      }
    };

    try {
      const decoded = verifyToken(token);
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(401).json({ message: "User not found, please login again" });
      }

      return next();
    } catch (error) {
      console.error("JWT verify error:", error);

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired. Please log in again" });
      }
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token. Please log in again" });
      }

      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

const admin = (req, res, next) => {
  if (req.user && (req.user.isAdmin === true || String(req.user.isAdmin).toLowerCase() === "true")) {
    next();
  } else {
    console.warn(`Admin access denied for user: ${req.user ? req.user.email : 'Unknown'}`);
    // 403 is more semantically correct for authenticated users without permission
    res.status(403).json({ message: "Not authorized as an admin" });
  }
};

// new helper that permits either admin or kitchen roles (used by kitchen dashboard)
const adminOrKitchen = (req, res, next) => {
  if (
    req.user &&
    ((req.user.isAdmin === true || String(req.user.isAdmin).toLowerCase() === "true") ||
      (req.user.isKitchen === true || String(req.user.isKitchen).toLowerCase() === "true"))
  ) {
    next();
  } else {
    console.warn(`Admin/Kitchen access denied for user: ${req.user ? req.user.email : 'Unknown'}`);
    res.status(403).json({ message: "Not authorized" });
  }
};

// permits admin, kitchen, or waiter roles (for updating order status)
const adminOrKitchenOrWaiter = (req, res, next) => {
  if (
    req.user &&
    ((req.user.isAdmin === true || String(req.user.isAdmin).toLowerCase() === "true") ||
      (req.user.isKitchen === true || String(req.user.isKitchen).toLowerCase() === "true") ||
      (req.user.isWaiter === true || String(req.user.isWaiter).toLowerCase() === "true"))
  ) {
    next();
  } else {
    console.warn(`Admin/Kitchen/Waiter access denied for user: ${req.user ? req.user.email : 'Unknown'}`);
    res.status(403).json({ message: "Not authorized" });
  }
};

module.exports = { protect, admin, adminOrKitchen, adminOrKitchenOrWaiter };
