const HRShiftModel = require('../models/HRShift');
const { getModel } = require('../utils/getModel');

const HRShift = async (req) => getModel('HRShift', HRShiftModel.schema, req.restaurantId);
const HRStaffModel2 = require('../models/HRStaff');
const HRStaff = async (req) => getModel('HRStaff', HRStaffModel2.schema, req.restaurantId);

// @desc  Get all shifts
// @route GET /api/hr/shifts
const getShifts = async (req, res) => {
  try {
    const shifts = await (await HRShift(req)).find()
      .populate('assignedStaff', 'name email designation department')
      .sort({ createdAt: -1 });
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get single shift
// @route GET /api/hr/shifts/:id
const getShiftById = async (req, res) => {
  try {
    const shift = await (await HRShift(req)).findById(req.params.id)
      .populate('assignedStaff', 'name email designation department');
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    res.json(shift);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Create shift
// @route POST /api/hr/shifts
const createShift = async (req, res) => {
  try {
    const { name, type, shiftType, startTime, endTime, description, assignedStaff, staff } = req.body;
    const finalType = type || shiftType || 'custom';
    const finalStaff = assignedStaff || staff || [];

    if (!name || !startTime || !endTime)
      return res.status(400).json({ message: 'Name, startTime and endTime are required' });

    const shift = await (await HRShift(req)).create({ 
      name, 
      type: finalType, 
      startTime, 
      endTime, 
      description, 
      assignedStaff: finalStaff 
    });

    // Update currentShift on assigned staff
    if (finalStaff.length > 0) {
      await (await HRStaff(req)).updateMany({ _id: { $in: finalStaff } }, { currentShift: shift._id });
    }

    const populated = await (await HRShift(req)).findById(shift._id)
      .populate('assignedStaff', 'name email designation department');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Update shift
// @route PUT /api/hr/shifts/:id
const updateShift = async (req, res) => {
  try {
    const old = await (await HRShift(req)).findById(req.params.id);
    if (!old) return res.status(404).json({ message: 'Shift not found' });

    const { assignedStaff, staff, type, shiftType, ...rest } = req.body;
    let finalStaff = assignedStaff || staff;
    const finalType = type || shiftType;

    // If finalStaff is provided, handle currentShift references
    if (finalStaff !== undefined) {
      // Ensure finalStaff is an array of strings for comparison
      const finalStaffIds = Array.isArray(finalStaff) 
        ? finalStaff.map(s => String(typeof s === 'object' ? s._id : s))
        : [];
      
      const oldStaffIds = Array.isArray(old.assignedStaff)
        ? old.assignedStaff.map(s => String(typeof s === 'object' ? s._id : s))
        : [];

      // Find staff removed
      const removed = oldStaffIds.filter(id => !finalStaffIds.includes(id));
      if (removed.length > 0) {
        await (await HRStaff(req)).updateMany({ _id: { $in: removed } }, { $unset: { currentShift: '' } });
      }

      // Set shift on newly assigned
      if (finalStaffIds.length > 0) {
        await (await HRStaff(req)).updateMany({ _id: { $in: finalStaffIds } }, { currentShift: old._id });
      }
      
      finalStaff = finalStaffIds; // Use normalized IDs for update
    }

    const updateData = { ...rest };
    if (finalStaff !== undefined) updateData.assignedStaff = finalStaff;
    if (finalType !== undefined) updateData.type = finalType;

    const shift = await (await HRShift(req)).findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('assignedStaff', 'name email designation department');

    res.json(shift);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Delete shift
// @route DELETE /api/hr/shifts/:id
const deleteShift = async (req, res) => {
  try {
    const shift = await (await HRShift(req)).findById(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    // Clear currentShift on assigned staff
    if (shift.assignedStaff.length > 0) {
      await (await HRStaff(req)).updateMany({ _id: { $in: shift.assignedStaff } }, { $unset: { currentShift: '' } });
    }
    await shift.deleteOne();
    res.json({ message: 'Shift deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Assign staff to shift
// @route PUT /api/hr/shifts/:id/assign
const assignStaffToShift = async (req, res) => {
  try {
    const { staffIds } = req.body; // array of staff IDs to add
    if (!Array.isArray(staffIds) || staffIds.length === 0)
      return res.status(400).json({ message: 'staffIds array required' });

    const shift = await (await HRShift(req)).findByIdAndUpdate(
      req.params.id,
      { $addToSet: { assignedStaff: { $each: staffIds } } },
      { new: true }
    ).populate('assignedStaff', 'name email designation department');

    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    await (await HRStaff(req)).updateMany({ _id: { $in: staffIds } }, { currentShift: shift._id });
    res.json(shift);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = { getShifts, getShiftById, createShift, updateShift, deleteShift, assignStaffToShift };
