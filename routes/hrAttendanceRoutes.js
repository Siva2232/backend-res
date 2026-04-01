const express = require('express');
const router = express.Router();
const {
  getAttendance, markAttendance, updateAttendance, deleteAttendance,
  getAttendanceSummary, getMyAttendance,
  getAttendanceLocation, setAttendanceLocation, locationAttendance,
} = require('../controllers/hrAttendanceController');
const { protectHR, protectAny, anyAdmin } = require('../middleware/hrAuthMiddleware');

// Staff — get own attendance history
router.get('/mine', protectAny, getMyAttendance);

// Staff — check-in / check-out via GPS (requires location within radius)
router.post('/location', protectAny, locationAttendance);

// Admin — get / set the work location used for attendance radius check
router.get('/location-config', protectAny, anyAdmin, getAttendanceLocation);
router.post('/location-config', protectAny, anyAdmin, setAttendanceLocation);

// Admin/Manager
router.get('/', protectAny, anyAdmin, getAttendance);
router.post('/', protectAny, anyAdmin, markAttendance);
router.get('/summary/:staffId', protectAny, anyAdmin, getAttendanceSummary);
router.put('/:id', protectAny, anyAdmin, updateAttendance);
router.delete('/:id', protectAny, anyAdmin, deleteAttendance);

module.exports = router;
