const HRPayrollModel = require('../models/HRPayroll');
const { getModel } = require('../utils/getModel');

const HRPayroll = async (req) => getModel('HRPayroll', HRPayrollModel.schema, req.restaurantId);
const HRStaffModel2 = require('../models/HRStaff');
const HRStaff = async (req) => getModel('HRStaff', HRStaffModel2.schema, req.restaurantId);
const HRAttendanceModel2 = require('../models/HRAttendance');
const HRAttendance = async (req) => getModel('HRAttendance', HRAttendanceModel2.schema, req.restaurantId);
const { sendPayslipEmail } = require('../services/emailService');
const { generatePayslipPDF } = require('../services/payslipService');

// ─── Generate / Calculate ──────────────────────────────────────────────────────

// @desc  Generate payroll for a specific staff member for a month
// @route POST /api/hr/payroll/generate
const generatePayroll = async (req, res) => {
  try {
    const { staffId, month, year, bonus = 0, overtime = 0, notes, workingDays = 26 } = req.body;
    if (!staffId || !month || !year)
      return res.status(400).json({ message: 'staffId, month and year are required' });

    const staff = await (await HRStaff(req)).findById(staffId);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    // Pull attendance data for the month
    const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const end = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));

    const attendance = await (await HRAttendance(req)).find({
      staff: staffId,
      date: { $gte: start, $lte: end },
    });

    let presentDays = 0, absentDays = 0, leaveDays = 0;
    attendance.forEach((a) => {
      if (a.status === 'present') presentDays++;
      else if (a.status === 'absent') absentDays++;
      else if (a.status === 'leave') leaveDays++;
      else if (a.status === 'half-day') presentDays += 0.5;
    });

    // Daily rate for deduction
    const dailyRate = staff.baseSalary / workingDays;
    const leaveDeduction = (absentDays + leaveDays) * dailyRate;

    const payrollData = {
      staff: staffId,
      month: Number(month),
      year: Number(year),
      baseSalary: staff.baseSalary,
      workingDays,
      presentDays,
      absentDays,
      leaveDays,
      leaveDeduction: Math.round(leaveDeduction * 100) / 100,
      bonus: Number(bonus),
      overtime: Number(overtime),
      netSalary: Math.max(0, staff.baseSalary - (Math.round(leaveDeduction * 100) / 100) + Number(bonus) + Number(overtime)),
      notes,
      generatedBy: req.hrStaff?._id || req.user?._id,
    };

    const payroll = await (await HRPayroll(req)).findOneAndUpdate(
      { staff: staffId, month: Number(month), year: Number(year) },
      payrollData,
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const populated = await (await HRPayroll(req)).findById(payroll._id).populate('staff', 'name email designation department baseSalary');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Bulk generate payroll for all active staff for a month
// @route POST /api/hr/payroll/generate-all
const generatePayrollAll = async (req, res) => {
  try {
    const { month, year, workingDays = 26 } = req.body;
    if (!month || !year)
      return res.status(400).json({ message: 'month and year are required' });

    const allStaff = await (await HRStaff(req)).find({ status: 'active' });
    const results = [];

    for (const staff of allStaff) {
      const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      const end = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
      const attendance = await (await HRAttendance(req)).find({ staff: staff._id, date: { $gte: start, $lte: end } });

      let presentDays = 0, absentDays = 0, leaveDays = 0;
      attendance.forEach((a) => {
        if (a.status === 'present') presentDays++;
        else if (a.status === 'absent') absentDays++;
        else if (a.status === 'leave') leaveDays++;
        else if (a.status === 'half-day') presentDays += 0.5;
      });

      const dailyRate = staff.baseSalary / workingDays;
      const leaveDeduction = (absentDays + leaveDays) * dailyRate;

      const payroll = await (await HRPayroll(req)).findOneAndUpdate(
        { staff: staff._id, month: Number(month), year: Number(year) },
        {
          staff: staff._id, month: Number(month), year: Number(year),
          baseSalary: staff.baseSalary, workingDays, presentDays, absentDays, leaveDays,
          leaveDeduction: Math.round(leaveDeduction * 100) / 100, bonus: 0, overtime: 0,
          netSalary: Math.max(0, staff.baseSalary - (Math.round(leaveDeduction * 100) / 100)),
          generatedBy: req.hrStaff?._id || req.user?._id,
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      results.push(payroll);
    }

    res.status(201).json({ message: `Payroll generated for ${results.length} staff`, count: results.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Read ─────────────────────────────────────────────────────────────────────

// @desc  Get payroll records
// @route GET /api/hr/payroll
const getPayrolls = async (req, res) => {
  try {
    const { staffId, month, year, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (staffId) query.staff = staffId;
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);
    if (status) query.status = status;

    const total = await (await HRPayroll(req)).countDocuments(query);
    const payrolls = await (await HRPayroll(req)).find(query)
      .populate('staff', 'name email designation department')
      .sort({ year: -1, month: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ payrolls, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get single payroll record
// @route GET /api/hr/payroll/:id
const getPayrollById = async (req, res) => {
  try {
    const payroll = await (await HRPayroll(req)).findById(req.params.id)
      .populate('staff', 'name email phone designation department joiningDate baseSalary avatar');
    if (!payroll) return res.status(404).json({ message: 'Payroll not found' });
    res.json(payroll);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Update payroll (adjust bonus, overtime, status, etc.)
// @route PUT /api/hr/payroll/:id
const updatePayroll = async (req, res) => {
  try {
    const allowed = ['bonus', 'overtime', 'status', 'notes', 'paidAt'];
    const payroll = await (await HRPayroll(req)).findById(req.params.id);
    if (!payroll) return res.status(404).json({ message: 'Payroll not found' });
    
    allowed.forEach((k) => { if (req.body[k] !== undefined) payroll[k] = req.body[k]; });
    if (payroll.status === 'paid' && !payroll.paidAt) payroll.paidAt = new Date();

    await payroll.save();
    const populated = await (await HRPayroll(req)).findById(payroll._id).populate('staff', 'name email designation department baseSalary');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── Payslip ──────────────────────────────────────────────────────────────────

// @desc  Send payslip via email
// @route POST /api/hr/payroll/:id/send-payslip
const sendPayslip = async (req, res) => {
  try {
    const payroll = await (await HRPayroll(req)).findById(req.params.id)
      .populate('staff', 'name email phone designation department joiningDate baseSalary');
    if (!payroll) return res.status(404).json({ message: 'Payroll not found' });

    const pdfBuffer = await generatePayslipPDF(payroll);
    await sendPayslipEmail(payroll.staff.email, payroll.staff.name, payroll, pdfBuffer);

    payroll.payslipSent = true;
    payroll.payslipSentAt = new Date();
    await payroll.save();

    res.json({ message: `Payslip sent to ${payroll.staff.email}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Download payslip PDF (returns base64 for frontend rendering)
// @route GET /api/hr/payroll/:id/payslip-pdf
const downloadPayslipPDF = async (req, res) => {
  try {
    const payroll = await (await HRPayroll(req)).findById(req.params.id)
      .populate('staff', 'name email phone designation department joiningDate baseSalary');
    if (!payroll) return res.status(404).json({ message: 'Payroll not found' });

    const pdfBuffer = await generatePayslipPDF(payroll);
    const monthName = new Date(2000, payroll.month - 1).toLocaleString('en', { month: 'long' });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${payroll.staff.name.replace(/\s/g, '_')}-${monthName}-${payroll.year}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get my payroll history (staff portal)
// @route GET /api/hr/payroll/mine
const getMyPayrolls = async (req, res) => {
  try {
    const payrolls = await (await HRPayroll(req)).find({ staff: req.hrStaff._id })
      .sort({ year: -1, month: -1 });
    res.json(payrolls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  generatePayroll, generatePayrollAll, getPayrolls, getPayrollById,
  updatePayroll, sendPayslip, downloadPayslipPDF, getMyPayrolls,
};
