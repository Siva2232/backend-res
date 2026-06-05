const HRStaffModel = require("../../models/HRStaff");
const HRAttendanceModel = require("../../models/HRAttendance");
const HRLeaveModel = require("../../models/HRLeave");
const { getModel } = require("../../utils/getModel");

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function istHour() {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

/** True when same-day auto-absent is allowed (after 10 PM IST — ~22h into the day). */
function shouldAutoAbsentOnFetch(dateStr) {
  const todayKey = istDateKey();
  if (dateStr < todayKey) return true;
  if (dateStr === todayKey && istHour() >= 22) return true;
  return false;
}

function dayRangeFromYMD(dateStr) {
  const start = new Date(dateStr);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function hasPresence(record) {
  if (!record) return false;
  if (record.status === "present" || record.status === "half-day") return true;
  if (record.checkIn) return true;
  return false;
}

function isOnApprovedLeave(leave, dayStart, dayEnd) {
  const leaveStart = new Date(leave.startDate);
  leaveStart.setUTCHours(0, 0, 0, 0);
  const leaveEnd = new Date(leave.endDate);
  leaveEnd.setUTCHours(23, 59, 59, 999);
  return leaveStart <= dayEnd && leaveEnd >= dayStart;
}

/**
 * Auto-mark absent for active staff with no check-in and no approved leave on a given day.
 * Staff on approved leave get a leave record if missing.
 * @returns {{ absent: number, leave: number, skipped: number }}
 */
async function ensureAutoAbsentForDate(restaurantId, dateStr, { io } = {}) {
  if (!restaurantId || !dateStr) return { absent: 0, leave: 0, skipped: 0 };

  const todayKey = istDateKey();
  if (dateStr > todayKey) return { absent: 0, leave: 0, skipped: 0 };

  const { start, end } = dayRangeFromYMD(dateStr);
  const HRStaff = await getModel("HRStaff", HRStaffModel.schema, restaurantId);
  const HRAttendance = await getModel("HRAttendance", HRAttendanceModel.schema, restaurantId);
  const HRLeave = await getModel("HRLeave", HRLeaveModel.schema, restaurantId);

  const [activeStaff, approvedLeaves] = await Promise.all([
    HRStaff.find({ status: "active" }).select("_id name").lean(),
    HRLeave.find({
      status: "approved",
      startDate: { $lte: end },
      endDate: { $gte: start },
    })
      .select("staff startDate endDate")
      .lean(),
  ]);

  const leaveByStaff = new Map();
  approvedLeaves.forEach((lv) => {
    if (!isOnApprovedLeave(lv, start, end)) return;
    const sid = String(lv.staff);
    if (!leaveByStaff.has(sid)) leaveByStaff.set(sid, lv);
  });

  let absent = 0;
  let leave = 0;
  let skipped = 0;
  const updates = [];

  for (const staff of activeStaff) {
    const sid = String(staff._id);
    const existing = await HRAttendance.findOne({
      staff: staff._id,
      date: { $gte: start, $lte: end },
    });

    if (hasPresence(existing)) {
      skipped += 1;
      continue;
    }

    if (existing && ["leave", "holiday"].includes(existing.status)) {
      skipped += 1;
      continue;
    }

    if (leaveByStaff.has(sid)) {
      if (existing?.status === "leave") {
        skipped += 1;
        continue;
      }
      const record = await HRAttendance.findOneAndUpdate(
        { staff: staff._id, date: { $gte: start, $lte: end } },
        {
          staff: staff._id,
          date: start,
          status: "leave",
          note: existing?.note || "Auto: approved leave",
        },
        { upsert: true, new: true, runValidators: true }
      ).populate("staff", "name email department");
      leave += 1;
      updates.push(record);
      continue;
    }

    if (existing?.status === "absent") {
      skipped += 1;
      continue;
    }

    const record = await HRAttendance.findOneAndUpdate(
      { staff: staff._id, date: { $gte: start, $lte: end } },
      {
        staff: staff._id,
        date: start,
        status: "absent",
        note: existing?.note || "Auto-marked absent (no check-in within 24h)",
      },
      { upsert: true, new: true, runValidators: true }
    ).populate("staff", "name email department");
    absent += 1;
    updates.push(record);
  }

  if (io && updates.length > 0) {
    io.to(restaurantId).emit("attendanceUpdate", updates.length === 1 ? updates[0] : updates);
  }

  return { absent, leave, skipped };
}

/** Process yesterday (IST) for all active restaurants — called by cron after day ends. */
async function runDailyAutoAbsentForAllTenants({ io } = {}) {
  const yesterday = istDateKey(new Date(Date.now() - 86400000));
  const Restaurant = require("../../models/Restaurant");
  const restaurants = await Restaurant.find({ isActive: true }, "restaurantId").lean();

  let totalAbsent = 0;
  let totalLeave = 0;

  for (const r of restaurants) {
    try {
      const result = await ensureAutoAbsentForDate(r.restaurantId, yesterday, { io });
      totalAbsent += result.absent;
      totalLeave += result.leave;
      if (result.absent > 0 || result.leave > 0) {
        console.log(
          `[HR Cron] Auto attendance ${r.restaurantId} ${yesterday}: ${result.absent} absent, ${result.leave} leave`
        );
      }
    } catch (err) {
      console.error(`[HR Cron] Auto absent failed for ${r.restaurantId}:`, err.message);
    }
  }

  return { date: yesterday, totalAbsent, totalLeave };
}

module.exports = {
  istDateKey,
  istHour,
  shouldAutoAbsentOnFetch,
  ensureAutoAbsentForDate,
  runDailyAutoAbsentForAllTenants,
};
