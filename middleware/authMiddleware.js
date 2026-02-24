const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
      
      if (!req.user) {
        return res.status(401).json({ message: "User not found, please login again" });
      }

      next();
    } catch (error) {
      console.error("JWT verify error:", error);
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

module.exports = { protect, admin, adminOrKitchen };
