const HRAttendanceModel = require('../../../models/HRAttendance');
const { getModel } = require('../../../utils/getModel');

const HRAttendance = async (req) => getModel('HRAttendance', HRAttendanceModel.schema, req.restaurantId);
const HRStaffModel2 = require('../../../models/HRStaff');
const HRStaff = async (req) => getModel('HRStaff', HRStaffModel2.schema, req.restaurantId);
const SettingsModel = require('../../../models/Settings');
const Settings = async (req) => getModel('Settings', SettingsModel.schema, req.restaurantId);
const { emitUpdate } = require('../../../utils/socketUtils');
const { ensureAutoAbsentForDate, shouldAutoAbsentOnFetch } = require('../../../services/hr/autoAbsentAttendance');

// Haversine distance in metres between two lat/lng points
const haversineMetres = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// IST is UTC+5:30 and never observes Daylight Saving Time
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Returns current date string and HH:MM time in IST
const nowIST = () => {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return {
    dateStr:   d.toISOString().slice(0, 10),  // "YYYY-MM-DD"
    checkTime: d.toISOString().slice(11, 16), // "HH:MM"
  };
};

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
      // Past days, or today after 10 PM IST: auto-mark absent if no check-in & no approved leave
      if (shouldAutoAbsentOnFetch(date) && req.restaurantId) {
        const io = req.app.get('io');
        await ensureAutoAbsentForDate(req.restaurantId, date, { io });
      }
    } else if (month && year) {
      const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      const end = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
      query.date = { $gte: start, $lte: end };
    }

    const total = await (await HRAttendance(req)).countDocuments(query);
    const records = await (await HRAttendance(req)).find(query)
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

      const { start, end } = dayRange(date);

      // Calculate work hours if both checkIn and checkOut provided
      let workHours = 0;
      if (checkIn && checkOut) {
        const [inH, inM] = checkIn.split(':').map(Number);
        const [outH, outM] = checkOut.split(':').map(Number);
        workHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
        if (workHours < 0) workHours += 24; // crosses midnight
      }

      const record = await (await HRAttendance(req)).findOneAndUpdate(
        { staff, date: { $gte: start, $lte: end } },
        { staff, date: start, status: status || 'present', checkIn, checkOut, workHours, note,
          markedBy: req.hrStaff?._id || req.user?._id },
        { upsert: true, new: true, runValidators: true }
      ).populate('staff', 'name email');

      results.push(record);
    }
    const finalResult = results.length === 1 ? results[0] : results;
    emitUpdate(req, 'attendanceUpdate', finalResult);
    res.status(201).json(finalResult);
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

    const record = await (await HRAttendance(req)).findByIdAndUpdate(
      req.params.id,
      { status, checkIn, checkOut, workHours, note },
      { new: true, runValidators: true }
    ).populate('staff', 'name email');
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    emitUpdate(req, 'attendanceUpdate', record);
    res.json(record);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Delete attendance record
// @route DELETE /api/hr/attendance/:id
const deleteAttendance = async (req, res) => {
  try {
    const record = await (await HRAttendance(req)).findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    emitUpdate(req, 'attendanceDelete', req.params.id);
    res.json({ message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Month calendar overview — daily status counts for team view
// @route GET /api/hr/attendance/calendar-overview
const getCalendarOverview = async (req, res) => {
  try {
    const m = Number(req.query.month) || new Date().getMonth() + 1;
    const y = Number(req.query.year) || new Date().getFullYear();
    const department = String(req.query.department || "").trim();

    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const daysInMonth = end.getUTCDate();

    const StaffM = await HRStaff(req);
    let staffIds = null;
    let staffCount = 0;

    if (department) {
      const staffList = await StaffM.find({ department, status: "active" }).select("_id").lean();
      staffIds = staffList.map((s) => s._id);
      staffCount = staffIds.length;
    } else {
      staffCount = await StaffM.countDocuments({ status: "active" });
    }

    const match = { date: { $gte: start, $lte: end } };
    if (staffIds) match.staff = { $in: staffIds };

    const dayMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      dayMap[dateStr] = { date: dateStr, present: 0, absent: 0, leave: 0, halfDay: 0, total: 0 };
    }

    const summary = { present: 0, absent: 0, leave: 0, halfDay: 0, totalWorkHours: 0 };

    if (!department || staffIds.length > 0) {
      const rows = await (await HRAttendance(req)).aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              status: "$status",
            },
            count: { $sum: 1 },
            workHours: { $sum: { $ifNull: ["$workHours", 0] } },
          },
        },
      ]);

      rows.forEach((row) => {
        const date = row._id.date;
        const status = row._id.status;
        const bucket = dayMap[date];
        if (!bucket) return;
        const count = row.count || 0;
        if (status === "present") {
          bucket.present += count;
          summary.present += count;
        } else if (status === "absent") {
          bucket.absent += count;
          summary.absent += count;
        } else if (status === "leave") {
          bucket.leave += count;
          summary.leave += count;
        } else if (status === "half-day") {
          bucket.halfDay += count;
          summary.halfDay += count;
        }
        summary.totalWorkHours += row.workHours || 0;
        bucket.total += count;
      });
    }

    res.json({
      month: m,
      year: y,
      staffCount,
      summary: {
        ...summary,
        totalWorkHours: Number(summary.totalWorkHours.toFixed(1)),
      },
      daily: Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
    });
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

    const records = await (await HRAttendance(req)).find({
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
      const hrStaff = await (await HRStaff(req)).findOne({ email: req.user.email });
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

    const records = await (await HRAttendance(req)).find({
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

// @desc  Get the admin-configured attendance location
// @route GET /api/hr/attendance/location-config
const getAttendanceLocation = async (req, res) => {
  try {
    const setting = await (await Settings(req)).findOne({ key: 'attendance_location' });
    res.json(setting ? setting.value : null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Set or update the attendance location (admin only)
// @route POST /api/hr/attendance/location-config
const setAttendanceLocation = async (req, res) => {
  try {
    const { lat, lng, radius = 100, label } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ message: 'lat and lng are required' });
    }
    const value = { lat: Number(lat), lng: Number(lng), radius: Number(radius), label: label || '' };
    const setting = await (await Settings(req)).findOneAndUpdate(
      { key: 'attendance_location' },
      { key: 'attendance_location', value },
      { upsert: true, new: true }
    );
    res.json(setting.value);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Staff check-in / check-out via GPS location
// @route POST /api/hr/attendance/location
const locationAttendance = async (req, res) => {
  try {
    // Resolve staffId from either HR token or regular POS token
    let staffId;
    if (req.hrStaff) {
      staffId = req.hrStaff._id;
    } else if (req.user) {
      const hrStaff = await (await HRStaff(req)).findOne({ email: req.user.email });
      if (!hrStaff) {
        return res.status(404).json({
          message: 'No HR staff profile found for this account. Please ask admin to create your staff profile.',
        });
      }
      staffId = hrStaff._id;
    } else {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ message: 'Location (lat, lng) is required' });
    }

    // Verify against the admin-set location
    const setting = await (await Settings(req)).findOne({ key: 'attendance_location' });
    if (!setting || !setting.value) {
      return res.status(400).json({ message: 'Attendance location has not been configured by admin yet.' });
    }

    const { lat: aLat, lng: aLng, radius = 100 } = setting.value;
    const distance = haversineMetres(Number(lat), Number(lng), aLat, aLng);

    if (distance > radius) {
      return res.status(403).json({
        message: `You are ${Math.round(distance)}m away from the work location. Must be within ${radius}m to mark attendance.`,
        distance: Math.round(distance),
        radius,
      });
    }

    const staff = staffId;
    const { dateStr, checkTime } = nowIST(); // use IST, not server-local UTC
    const { start, end } = dayRange(dateStr);
    const existing = await (await HRAttendance(req)).findOne({ staff, date: { $gte: start, $lte: end } });

    let update = {
      staff,
      date: start,
      status: 'present',
      location: { lat: Number(lat), lng: Number(lng) },
      markedBy: staff,
    };

    if (existing && existing.checkIn) {
      update.checkOut = checkTime;
      const [inH, inM] = existing.checkIn.split(':').map(Number);
      const [outH, outM] = checkTime.split(':').map(Number);
      let workHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
      if (workHours < 0) workHours += 24;
      update.workHours = workHours;
    } else {
      update.checkIn = checkTime;
    }

    const record = await (await HRAttendance(req)).findOneAndUpdate(
      { staff, date: { $gte: start, $lte: end } },
      update,
      { upsert: true, new: true }
    ).populate('staff', 'name email');

    const io = req.app.get('io');
    if (io) io.to(req.restaurantId).emit('attendanceUpdate', record);

    res.status(201).json({ record, distance: Math.round(distance) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = {
  getAttendance, markAttendance, updateAttendance, deleteAttendance,
  getCalendarOverview, getAttendanceSummary, getMyAttendance,
  getAttendanceLocation, setAttendanceLocation, locationAttendance,
};
