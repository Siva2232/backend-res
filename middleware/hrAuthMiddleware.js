const jwt = require('jsonwebtoken');
const HRStaffModel = require('../models/HRStaff');
const { getModel } = require('../utils/getModel');

/**
 * Middleware: Protect HR routes — verifies JWT issued by HR login.
 * Attaches req.hrStaff with the authenticated staff document.
 * Uses the per-restaurant (tenant) DB to look up the staff.
 */
const protectHR = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // restaurantId comes from the JWT payload (included at login) or from
    // the global middleware which reads it from query param / header.
    const restaurantId = (decoded.restaurantId || req.restaurantId || '').toUpperCase().trim();
    if (!restaurantId) {
      return res.status(400).json({ message: 'Restaurant ID required. Please include restaurantId.' });
    }
    // Look up staff in the per-restaurant tenant database
    const HRStaffTenant = await getModel('HRStaff', HRStaffModel.schema, restaurantId);
    const staff = await HRStaffTenant.findById(decoded.id).select('-password');
    if (!staff) return res.status(401).json({ message: 'Staff not found, please login again' });
    if (staff.status !== 'active') return res.status(403).json({ message: 'Account inactive' });
    req.hrStaff = staff;
    req.restaurantId = restaurantId;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ message: 'Token expired. Please log in again' });
    return res.status(401).json({ message: 'Invalid token. Please log in again' });
  }
};

/**
 * Middleware: Require HR admin or manager role.
 */
const hrAdmin = (req, res, next) => {
  if (req.hrStaff && (req.hrStaff.role === 'admin' || req.hrStaff.role === 'manager')) {
    return next();
  }
  return res.status(403).json({ message: 'Admin or Manager access required' });
};

/**
 * Middleware: Require HR admin role only.
 */
const hrAdminOnly = (req, res, next) => {
  if (req.hrStaff && req.hrStaff.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Admin access required' });
};

/**
 * Middleware: Accept POS admin (req.user) OR HR admin/manager (req.hrStaff).
 * Used for admin HR panel routes accessible with either token type.
 */
const anyAdmin = (req, res, next) => {
  if (req.user) return next(); // POS admin token — always trusted
  if (req.hrStaff && (req.hrStaff.role === 'admin' || req.hrStaff.role === 'manager')) return next();
  return res.status(403).json({ message: 'Admin or Manager access required' });
};

/**
 * Middleware: Accept POS admin (req.user) OR HR admin only (req.hrStaff role=admin).
 */
const anyAdminOnly = (req, res, next) => {
  if (req.user) return next(); // POS admin token — always trusted
  if (req.hrStaff && req.hrStaff.role === 'admin') return next();
  return res.status(403).json({ message: 'Admin access required' });
};

/**
 * Dual middleware: Accept either a valid POS admin JWT (req.user) OR a valid HR JWT (req.hrStaff).
 * Useful for endpoints accessible from both the POS admin panel and the HR panel.
 */
const protectAny = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const restaurantId = (decoded.restaurantId || req.restaurantId || '').toUpperCase().trim();

    // Try HR staff first (tenant-aware lookup)
    if (restaurantId) {
      const HRStaffTenant = await getModel('HRStaff', HRStaffModel.schema, restaurantId);
      const hrStaff = await HRStaffTenant.findById(decoded.id).select('-password');
      if (hrStaff && hrStaff.status === 'active') {
        req.hrStaff = hrStaff;
        req.restaurantId = restaurantId;
        return next();
      }
    }

    // Fall back to POS user (global model — Users are in the main DB)
    const User = require('../models/User');
    const user = await User.findById(decoded.id).select('-password');
    if (user) {
      req.user = user;
      const rid = user.restaurantId;
      if (rid) req.restaurantId = rid.toUpperCase();
      return next();
    }

    return res.status(401).json({ message: 'User not found' });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = { protectHR, hrAdmin, hrAdminOnly, protectAny, anyAdmin, anyAdminOnly };
