const express = require('express');
const router = express.Router();
const {
  loginStaff, getAllStaff, getStaffById, createStaff, updateStaff,
  deleteStaff, uploadDocument, deleteDocument, getMyProfile, changeMyPassword,
} = require('../controllers/hrStaffController');
const { protectHR, hrAdmin, hrAdminOnly, protectAny, anyAdmin, anyAdminOnly } = require('../middleware/hrAuthMiddleware');

// Public
router.post('/login', loginStaff);

// Protected – any authenticated HR staff (HR token only)
router.get('/me', protectHR, getMyProfile);
router.put('/me/password', protectHR, changeMyPassword);

// Admin / Manager only — accepts POS admin token OR HR admin/manager token
router.get('/', protectAny, anyAdmin, getAllStaff);
router.post('/', protectAny, anyAdminOnly, createStaff);
router.get('/:id', protectAny, anyAdmin, getStaffById);
router.put('/:id', protectAny, anyAdmin, updateStaff);
router.delete('/:id', protectAny, anyAdminOnly, deleteStaff);
router.post('/:id/documents', protectAny, anyAdmin, uploadDocument);
router.delete('/:id/documents/:docId', protectAny, anyAdmin, deleteDocument);

module.exports = router;
