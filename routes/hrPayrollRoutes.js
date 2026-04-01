const express = require('express');
const router = express.Router();
const {
  generatePayroll, generatePayrollAll, getPayrolls, getPayrollById,
  updatePayroll, sendPayslip, downloadPayslipPDF, getMyPayrolls,
} = require('../controllers/hrPayrollController');
const { protectHR, protectAny, anyAdmin } = require('../middleware/hrAuthMiddleware');

// Staff portal: own salary history (HR token only)
router.get('/mine', protectHR, getMyPayrolls);

// Admin/Manager — accepts POS admin token OR HR admin/manager token
router.get('/', protectAny, anyAdmin, getPayrolls);
router.post('/generate', protectAny, anyAdmin, generatePayroll);
router.post('/generate-all', protectAny, anyAdmin, generatePayrollAll);
router.get('/:id', protectAny, anyAdmin, getPayrollById);
router.put('/:id', protectAny, anyAdmin, updatePayroll);
router.post('/:id/send-payslip', protectAny, anyAdmin, sendPayslip);
router.get('/:id/payslip-pdf', protectAny, anyAdmin, downloadPayslipPDF);

module.exports = router;
