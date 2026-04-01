const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  getAttendance, markAttendance, updateAttendance, deleteAttendance,
  getAttendanceSummary, getMyAttendance, selfieAttendance
} = require('../controllers/hrAttendanceController');
const { protectHR, protectAny, anyAdmin } = require('../middleware/hrAuthMiddleware');

// Multer config for selfie
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/attendance/'),
  filename: (req, file, cb) => cb(null, `selfie-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// Staff selfie: accepts BOTH POS token (waiter/kitchen) AND HR token
router.get('/mine', protectAny, getMyAttendance);
router.post('/selfie', protectAny, upload.single('selfie'), selfieAttendance);

// Admin/Manager — accepts POS admin token OR HR admin/manager token
router.get('/', protectAny, anyAdmin, getAttendance);
router.post('/', protectAny, anyAdmin, markAttendance);
router.get('/summary/:staffId', protectAny, anyAdmin, getAttendanceSummary);
router.put('/:id', protectAny, anyAdmin, updateAttendance);
router.delete('/:id', protectAny, anyAdmin, deleteAttendance);

module.exports = router;
