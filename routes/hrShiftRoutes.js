const express = require('express');
const router = express.Router();
const {
  getShifts, getShiftById, createShift, updateShift, deleteShift, assignStaffToShift,
} = require('../controllers/hrShiftController');
const { protectAny, anyAdmin, anyAdminOnly } = require('../middleware/hrAuthMiddleware');

// All shift routes accept POS admin token OR HR admin/manager token
router.get('/', protectAny, anyAdmin, getShifts);
router.get('/:id', protectAny, anyAdmin, getShiftById);
router.post('/', protectAny, anyAdmin, createShift);
router.put('/:id', protectAny, anyAdmin, updateShift);
router.put('/:id/assign', protectAny, anyAdmin, assignStaffToShift);
router.delete('/:id', protectAny, anyAdminOnly, deleteShift);

module.exports = router;
