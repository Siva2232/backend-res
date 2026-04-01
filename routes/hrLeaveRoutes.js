const express = require('express');
const router = express.Router();
const {
  getLeaves, applyLeave, updateLeave, deleteLeave, getMyLeaves,
} = require('../controllers/hrLeaveController');
const { protectHR, protectAny, anyAdmin } = require('../middleware/hrAuthMiddleware');

// Staff portal: own leaves (HR token OR POS user token)
router.get('/mine', protectAny, getMyLeaves);
router.post('/', protectAny, applyLeave); // any HR staff can apply

// Admin/Manager: view all, approve/reject — accepts POS admin OR HR admin/manager
router.get('/', protectAny, anyAdmin, getLeaves);
router.put('/:id', protectAny, anyAdmin, updateLeave);
router.delete('/:id', protectAny, anyAdmin, deleteLeave);

module.exports = router;
