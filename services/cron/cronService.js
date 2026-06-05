const cron = require('node-cron');
const HRStaffModel = require("../../models/HRStaff");
const HRAttendanceModel = require("../../models/HRAttendance");
const HRPayrollModel = require("../../models/HRPayroll");
const { sendPayslipEmail } = require("../email/emailService");
const { generatePayslipPDF } = require("../pdf/payslipService");
const { getModel } = require("../../utils/getModel");

/**
 * Initialize all cron jobs for the HR module.
 * Call this once after the database is connected in server.js.
 */
const { runDailyAutoAbsentForAllTenants } = require('../hr/autoAbsentAttendance');

const initHRCronJobs = (app) => {
  // ── 1st of every month at 00:05 → auto-generate payroll ──────────────────
  cron.schedule('5 0 1 * *', async () => {
    console.log('[HR Cron] Generating monthly payroll...');
    try {
      const Restaurant = require("../../models/Restaurant");
      const restaurants = await Restaurant.find({ isActive: true }, 'restaurantId').lean();

      const now = new Date();
      let month = now.getMonth();
      let year = now.getFullYear();
      if (month === 0) { month = 12; year -= 1; }

      for (const r of restaurants) {
        try {
          const HRStaff = await getModel('HRStaff', HRStaffModel.schema, r.restaurantId);
          const HRAttendance = await getModel('HRAttendance', HRAttendanceModel.schema, r.restaurantId);
          const HRPayroll = await getModel('HRPayroll', HRPayrollModel.schema, r.restaurantId);

          const allStaff = await HRStaff.find({ status: 'active' });
          const workingDays = 26;

          for (const staff of allStaff) {
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
            const attendance = await HRAttendance.find({ staff: staff._id, date: { $gte: start, $lte: end } });

            let presentDays = 0, absentDays = 0, leaveDays = 0;
            attendance.forEach((a) => {
              if (a.status === 'present') presentDays++;
              else if (a.status === 'absent') absentDays++;
              else if (a.status === 'leave') leaveDays++;
              else if (a.status === 'half-day') presentDays += 0.5;
            });

            const dailyRate = staff.baseSalary / workingDays;
            const leaveDeduction = (absentDays + leaveDays) * dailyRate;

            await HRPayroll.findOneAndUpdate(
              { staff: staff._id, month, year },
              {
                staff: staff._id, month, year, baseSalary: staff.baseSalary,
                workingDays, presentDays, absentDays, leaveDays,
                leaveDeduction: Math.round(leaveDeduction * 100) / 100,
                bonus: 0, overtime: 0,
              },
              { upsert: true, setDefaultsOnInsert: true }
            );
          }
          if (allStaff.length > 0) {
            console.log(`[HR Cron] Payroll generated for ${allStaff.length} staff in ${r.restaurantId} (${month}/${year})`);
          }
        } catch (rErr) {
          console.error(`[HR Cron] Payroll failed for ${r.restaurantId}:`, rErr.message);
        }
      }
    } catch (err) {
      console.error('[HR Cron] Payroll generation failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ── 1st of every month at 09:00 → auto-send payslip emails ───────────────
  cron.schedule('0 9 1 * *', async () => {
    console.log('[HR Cron] Sending payslip emails...');
    try {
      const Restaurant = require("../../models/Restaurant");
      const restaurants = await Restaurant.find({ isActive: true }, 'restaurantId').lean();

      const now = new Date();
      let month = now.getMonth();
      let year = now.getFullYear();
      if (month === 0) { month = 12; year -= 1; }

      let totalSent = 0;
      for (const r of restaurants) {
        try {
          const HRPayroll = await getModel('HRPayroll', HRPayrollModel.schema, r.restaurantId);
          const HRStaff = await getModel('HRStaff', HRStaffModel.schema, r.restaurantId);

          const payrolls = await HRPayroll.find({ month, year, payslipSent: false })
            .populate({ path: 'staff', model: HRStaff, select: 'name email phone designation department joiningDate baseSalary' });

          for (const payroll of payrolls) {
            try {
              if (!payroll.staff?.email) continue;
              const pdfBuffer = await generatePayslipPDF(payroll);
              await sendPayslipEmail(payroll.staff.email, payroll.staff.name, payroll, pdfBuffer);
              payroll.payslipSent = true;
              payroll.payslipSentAt = new Date();
              await payroll.save();
              totalSent++;
            } catch (emailErr) {
              console.error(`[HR Cron] Failed to send to ${payroll.staff?.email}:`, emailErr.message);
            }
          }
        } catch (rErr) {
          console.error(`[HR Cron] Email sending failed for ${r.restaurantId}:`, rErr.message);
        }
      }
      console.log(`[HR Cron] Payslip emails sent: ${totalSent}`);
    } catch (err) {
      console.error('[HR Cron] Email sending failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ── Daily 00:30 IST → auto-mark absent (no check-in) / leave (approved) for yesterday ──
  cron.schedule('30 0 * * *', async () => {
    console.log('[HR Cron] Running daily auto-absent attendance...');
    try {
      const io = app && app.get ? app.get('io') : null;
      const result = await runDailyAutoAbsentForAllTenants({ io });
      console.log(
        `[HR Cron] Auto-absent done for ${result.date}: ${result.totalAbsent} absent, ${result.totalLeave} leave synced`
      );
    } catch (err) {
      console.error('[HR Cron] Auto-absent job failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[HR Cron] Jobs initialized (payroll: 1st 00:05, emails: 1st 09:00, auto-absent: daily 00:30 IST)');
};

// Express app ref so cron jobs can emit Socket.IO events (set by initSubscriptionCronJobs).
let _cronApp = null;

function istDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription: emails + in-panel billing reminders (2×/day in last 5 days)
// ─────────────────────────────────────────────────────────────────────────────
const initSubscriptionCronJobs = (app) => {
  _cronApp = app || null;
  const Restaurant = require("../../models/Restaurant");
  const NotificationModel = require("../../models/Notification");
  const { getModel } = require("../../utils/getModel");

  const sendReminderEmail = async (toEmail, restaurantName, daysLeft, expiryDate) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    const { sendGenericEmail } = require("../email/emailService");
    const subject = `⚠️ Subscription Expiring in ${daysLeft} Day(s) — ${restaurantName}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#f72585">Subscription / trial expiry reminder</h2>
        <p>Dear <strong>${restaurantName}</strong>,</p>
        <p>Your subscription will expire on <strong>${new Date(expiryDate).toDateString()}</strong> — that's <strong>${daysLeft} day(s)</strong> from now.</p>
        <p>Please renew your plan to avoid service interruption.</p>
        <a href="${process.env.FRONTEND_URL || '#'}/admin/subscription"
           style="display:inline-block;background:#f72585;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600">
          Renew Now
        </a>
        <p style="margin-top:24px;color:#64748b;font-size:12px">This is an automated reminder. Do not reply to this email.</p>
      </div>`;
    try {
      if (typeof sendGenericEmail === 'function') {
        await sendGenericEmail(toEmail, subject, html);
      }
    } catch (e) {
      console.error('[Subscription Cron] Email failed:', e.message);
    }
  };

  /** In-admin notifications: twice daily (morning / evening) during final 5 days */
  const runBillingAdminNotifications = async (slot) => {
    const io = _cronApp && _cronApp.get('io');
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 5);

    const restaurants = await Restaurant.find({
      subscriptionStatus: { $in: ['active', 'trial'] },
      subscriptionExpiry: { $gt: now, $lte: horizon },
    });

    const todayKey = istDateKey(now);
    const flag = slot === 'morning' ? 'morning' : 'evening';

    for (const r of restaurants) {
      const msLeft = new Date(r.subscriptionExpiry) - now;
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      if (daysLeft > 5) continue;

      let slots = r.billingReminderSlots;
      if (!slots || typeof slots !== 'object') slots = { dateKey: '', morning: false, evening: false };
      if (slots.dateKey !== todayKey) {
        slots = { dateKey: todayKey, morning: false, evening: false };
      }
      if (slots[flag]) continue;

      const slotLabel = slot === 'morning' ? 'Morning reminder' : 'Evening reminder';
      const kind = r.subscriptionStatus === 'trial' ? 'trial' : 'plan';
      const message = `${slotLabel}: Your ${kind} ends in ${daysLeft} day(s) — renew before ${new Date(r.subscriptionExpiry).toLocaleDateString('en-GB')}. Open Subscription in admin.`;

      try {
        const Notification = await getModel('Notification', NotificationModel.schema, r.restaurantId);
        const doc = await Notification.create({
          table: 'Subscription',
          type: 'SubscriptionBilling',
          message,
          status: 'Pending',
        });
        const payload = doc.toObject ? doc.toObject() : doc;

        slots[flag] = true;
        slots.dateKey = todayKey;
        r.billingReminderSlots = slots;
        r.markModified('billingReminderSlots');
        await r.save();

        if (io) io.to(r.restaurantId).emit('newNotification', payload);
        console.log(`[Billing Cron] ${slot} panel notification → ${r.restaurantId} (${daysLeft}d left)`);
      } catch (e) {
        console.error(`[Billing Cron] Failed for ${r.restaurantId}:`, e.message);
      }
    }
  };

  // Morning / evening — different times (Asia/Kolkata)
  cron.schedule('30 9 * * *', async () => {
    console.log('[Billing Cron] Morning subscription reminders...');
    try {
      await runBillingAdminNotifications('morning');
    } catch (err) {
      console.error('[Billing Cron] Morning error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 18 * * *', async () => {
    console.log('[Billing Cron] Evening subscription reminders...');
    try {
      await runBillingAdminNotifications('evening');
    } catch (err) {
      console.error('[Billing Cron] Evening error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Daily email + expiry sweep (08:00)
  cron.schedule('0 8 * * *', async () => {
    console.log('[Subscription Cron] Checking subscription expiries...');
    try {
      const now = new Date();
      const in5Days = new Date(now);
      in5Days.setDate(in5Days.getDate() + 5);

      const restaurants = await Restaurant.find({
        subscriptionStatus: { $in: ['active', 'trial'] },
        subscriptionExpiry: { $lte: in5Days, $gte: now },
      });

      for (const r of restaurants) {
        const msLeft = r.subscriptionExpiry - now;
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

        if (daysLeft <= 5 && !r.reminderSent5Day && r.ownerEmail) {
          await sendReminderEmail(r.ownerEmail, r.name, daysLeft, r.subscriptionExpiry);
          r.reminderSent5Day = true;
          await r.save();
          console.log(`[Subscription Cron] 5-day email sent to ${r.name} (${r.restaurantId})`);
        }

        if (daysLeft <= 3 && !r.reminderSent3Days && r.ownerEmail) {
          await sendReminderEmail(r.ownerEmail, r.name, daysLeft, r.subscriptionExpiry);
          r.reminderSent3Days = true;
          await r.save();
          console.log(`[Subscription Cron] 3-day reminder sent to ${r.name} (${r.restaurantId})`);
        }

        if (daysLeft <= 1 && !r.reminderSent1Day && r.ownerEmail) {
          await sendReminderEmail(r.ownerEmail, r.name, daysLeft, r.subscriptionExpiry);
          r.reminderSent1Day = true;
          await r.save();
          console.log(`[Subscription Cron] 1-day reminder sent to ${r.name} (${r.restaurantId})`);
        }
      }

      const expired = await Restaurant.updateMany(
        { subscriptionStatus: { $in: ['active', 'trial'] }, subscriptionExpiry: { $lt: now } },
        { $set: { subscriptionStatus: 'expired' } }
      );
      if (expired.modifiedCount > 0)
        console.log(`[Subscription Cron] Marked ${expired.modifiedCount} subscription(s) as expired`);

    } catch (err) {
      console.error('[Subscription Cron] Error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[Subscription Cron] Jobs: email 08:00 · billing panel 09:30 & 18:00 (Asia/Kolkata)');
};

module.exports = { initHRCronJobs, initSubscriptionCronJobs };
