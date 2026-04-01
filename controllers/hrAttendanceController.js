const HRAttendance = require('../models/HRAttendance');
const HRStaff = require('../models/HRStaff');

// helper: parse "YYYY-MM-DD" to a date range covering full day in UTC
const dayRange = (dateStr) => {
  const start = new Date(dateStr);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

// @desc  Get attendance records (admin view with filters)
// @route GET /api/hr/attendance
const getAttendance = async (req, res) => {
  try {
    const { staffId, date, month, year, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (staffId) query.staff = staffId;
    if (status) query.status = status;

    if (date) {
      const { start, end } = dayRange(date);
      query.date = { $gte: start, $lte: end };
    } else if (month && year) {
      const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      const end = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
      query.date = { $gte: start, $lte: end };
    }

    const total = await HRAttendance.countDocuments(query);
    const records = await HRAttendance.find(query)
      .populate('staff', 'name email department designation')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ records, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Mark attendance for one or multiple staff
// @route POST /api/hr/attendance
const markAttendance = async (req, res) => {
  try {
    // Support bulk: [{ staff, date, status, checkIn, checkOut, note }]
    // or single object
    const entries = Array.isArray(req.body) ? req.body : [req.body];

    const results = [];
    for (const entry of entries) {
      const { staff, date, status, checkIn, checkOut, note } = entry;
      if (!staff || !date) continue;

      const { start } = dayRange(date);

      // Check if attendance already exists for this staff and date
      const existing = await HRAttendance.findOne({ staff, date: { $gte: start } });
      if (existing && existing.checkIn) {
        // If it was marked by a staff (not an admin or system auto-mark)
        if (existing.markedBy && String(existing.markedBy) === String(staff)) {
          // If already marked, push the record and skip update
          results.push(existing.populate('staff', 'name email'));
          continue;
        }
      }

      // Calculate work hours if both checkIn and checkOut provided
      let workHours = 0;
      if (checkIn && checkOut) {
        const [inH, inM] = checkIn.split(':').map(Number);
        const [outH, outM] = checkOut.split(':').map(Number);
        workHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
        if (workHours < 0) workHours += 24; // crosses midnight
      }

      const record = await HRAttendance.findOneAndUpdate(
        { staff, date: { $gte: new Date(start) } },
        { staff, date: start, status: status || 'present', checkIn, checkOut, workHours, note,
          markedBy: req.hrStaff?._id || req.user?._id },
        { upsert: true, new: true, runValidators: true }
      ).populate('staff', 'name email');

      results.push(record);
    }
    res.status(201).json(results.length === 1 ? results[0] : results);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Update a single attendance record
// @route PUT /api/hr/attendance/:id
const updateAttendance = async (req, res) => {
  try {
    const { status, checkIn, checkOut, note } = req.body;
    let workHours = 0;
    if (checkIn && checkOut) {
      const [inH, inM] = checkIn.split(':').map(Number);
      const [outH, outM] = checkOut.split(':').map(Number);
      workHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
      if (workHours < 0) workHours += 24;
    }

    const record = await HRAttendance.findByIdAndUpdate(
      req.params.id,
      { status, checkIn, checkOut, workHours, note },
      { new: true, runValidators: true }
    ).populate('staff', 'name email');
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Delete attendance record
// @route DELETE /api/hr/attendance/:id
const deleteAttendance = async (req, res) => {
  try {
    const record = await HRAttendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get attendance summary for a staff in a given month/year
// @route GET /api/hr/attendance/summary/:staffId
const getAttendanceSummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const records = await HRAttendance.find({
      staff: req.params.staffId,
      date: { $gte: start, $lte: end },
    });

    const summary = {
      present: 0, absent: 0, leave: 0, halfDay: 0, holiday: 0, totalWorkHours: 0,
    };
    records.forEach((r) => {
      if (r.status === 'present') summary.present++;
      else if (r.status === 'absent') summary.absent++;
      else if (r.status === 'leave') summary.leave++;
      else if (r.status === 'half-day') summary.halfDay++;
      else if (r.status === 'holiday') summary.holiday++;
      summary.totalWorkHours += r.workHours || 0;
    });

    res.json({ month: m, year: y, summary, records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get my attendance (staff portal)
// @route GET /api/hr/attendance/mine
const getMyAttendance = async (req, res) => {
  try {
    // Resolve staffId from either HR token or regular POS token
    let staffId;
    if (req.hrStaff) {
      staffId = req.hrStaff._id;
    } else if (req.user) {
      const hrStaff = await HRStaff.findOne({ email: req.user.email });
      if (!hrStaff) return res.status(404).json({ message: 'No HR staff profile found for this account.' });
      staffId = hrStaff._id;
    } else {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const records = await HRAttendance.find({
      staff: staffId,
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    const summary = { present: 0, absent: 0, leave: 0, halfDay: 0, totalWorkHours: 0 };
    records.forEach((r) => {
      if (r.status === 'present') summary.present++;
      else if (r.status === 'absent') summary.absent++;
      else if (r.status === 'leave') summary.leave++;
      else if (r.status === 'half-day') summary.halfDay++;
      summary.totalWorkHours += r.workHours || 0;
    });

    res.json({ month: m, year: y, summary, records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const selfieAttendance = async (req, res) => {
  try {
    // Support both HR token (req.hrStaff) and regular POS token (req.user)
    let staffId;
    if (req.hrStaff) {
      staffId = req.hrStaff._id;
    } else if (req.user) {
      // Look up the HRStaff record by email to link waiter/kitchen staff
      const hrStaff = await HRStaff.findOne({ email: req.user.email });
      if (!hrStaff) {
        return res.status(404).json({ message: 'No HR staff profile found for this account. Please ask admin to create your staff profile.' });
      }
      staffId = hrStaff._id;
    } else {
      return res.status(401).json({ message: 'Not authorized' });
    }
    const staff = staffId;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const { start } = dayRange(dateStr);
    const checkTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    let update = { 
      staff, 
      date: start, 
      status: 'present',
      markedBy: staff
    };

    if (req.file) {
      update.selfie = `/uploads/attendance/${req.file.filename}`;
    }
    
    if (req.body.location) {
      try {
        update.location = JSON.parse(req.body.location);
      } catch (e) {
        console.error("Location parse error", e);
      }
    }

    // If already checked in today, update checkOut, else update checkIn
    const existing = await HRAttendance.findOne({ staff, date: { $gte: start } });
    
    if (existing && existing.checkIn) {
      update.checkOut = checkTime;
      // Calculate work hours
      const [inH, inM] = existing.checkIn.split(':').map(Number);
      const [outH, outM] = checkTime.split(':').map(Number);
      let workHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
      if (workHours < 0) workHours += 24;
      update.workHours = workHours;
    } else {
      update.checkIn = checkTime;
    }

    const record = await HRAttendance.findOneAndUpdate(
      { staff, date: { $gte: start } },
      update,
      { upsert: true, new: true }
    ).populate('staff', 'name email');

    // Emit socket event for admin panel real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('attendanceUpdate', record);
    }

    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = {
  getAttendance, markAttendance, updateAttendance, deleteAttendance,
  getAttendanceSummary, getMyAttendance, selfieAttendance
};
