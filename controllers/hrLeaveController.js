const HRLeaveModel = require('../models/HRLeave');
const { getModel } = require('../utils/getModel');

const HRLeave = (req) => getModel('HRLeave', HRLeaveModel.schema, req.restaurantId);
const HRStaffBaseModel = require('../models/HRStaff');
const HRStaff = (req) => getModel('HRStaff', HRStaffBaseModel.schema, req.restaurantId);
const { emitUpdate } = require('../utils/socketUtils');

// @desc  Get leaves (admin: all, staff: own)
// @route GET /api/hr/leaves
const getLeaves = async (req, res) => {
  try {
    const { staffId, status, type, page = 1, limit = 20 } = req.query;
    const query = {};
    if (staffId) query.staff = staffId;
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await HRLeave(req).countDocuments(query);
    const leaves = await HRLeave(req).find(query)
      .populate('staff', 'name email department')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ leaves, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Apply for leave (staff portal)
// @route POST /api/hr/leaves
const applyLeave = async (req, res) => {
  try {
    const { type, startDate, endDate, reason } = req.body;
    if (!type || !startDate || !endDate || !reason)
      return res.status(400).json({ message: 'All fields are required' });

    // Determine staff context for both HR and POS tokens
    let staffDoc = null;
    if (req.hrStaff) {
      staffDoc = req.hrStaff;
    } else if (req.user) {
      staffDoc = await HRStaff(req).findOne({ email: req.user.email });
      if (!staffDoc) return res.status(404).json({ message: 'No HR staff profile found for this account' });
    }

    if (!staffDoc) return res.status(401).json({ message: 'Not authorized' });

    const staffId = req.hrStaff?.role !== 'admin' ? staffDoc._id : (req.body.staffId || staffDoc._id);

    const leave = await HRLeave(req).create({ staff: staffId, type, startDate, endDate, reason });
    const populated = await HRLeave(req).findById(leave._id).populate('staff', 'name email');
    emitUpdate(req, 'leaveUpdate', populated);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Update leave status (admin approve/reject)
// @route PUT /api/hr/leaves/:id
const updateLeave = async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    const leave = await HRLeave(req).findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    if (status) {
      leave.status = status;
      leave.reviewedBy = req.hrStaff?._id || req.user?._id;
      leave.reviewedAt = new Date();
    }
    if (reviewNote !== undefined) leave.reviewNote = reviewNote;

    await leave.save();
    const populated = await HRLeave(req).findById(leave._id)
      .populate('staff', 'name email department')
      .populate('reviewedBy', 'name');
    emitUpdate(req, 'leaveUpdate', populated);
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Delete leave application
// @route DELETE /api/hr/leaves/:id
const deleteLeave = async (req, res) => {
  try {
    const leave = await HRLeave(req).findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    await leave.deleteOne();
    emitUpdate(req, 'leaveDelete', req.params.id);
    res.json({ message: 'Leave deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get my leaves (staff portal)
// @route GET /api/hr/leaves/mine
const getMyLeaves = async (req, res) => {
  try {
    const { status } = req.query;
    let staffId;

    if (req.hrStaff) {
      staffId = req.hrStaff._id;
    } else if (req.user) {
      const staffDoc = await HRStaff(req).findOne({ email: req.user.email });
      if (!staffDoc) return res.status(404).json({ message: 'No HR staff profile found for this account' });
      staffId = staffDoc._id;
    } else {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const query = { staff: staffId };
    if (status) query.status = status;

    const leaves = await HRLeave(req).find(query)
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLeaves, applyLeave, updateLeave, deleteLeave, getMyLeaves };
