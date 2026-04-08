const cron = require('node-cron');
const HRStaff = require('../models/HRStaff');
const HRAttendance = require('../models/HRAttendance');
const HRPayroll = require('../models/HRPayroll');
const { sendPayslipEmail } = require('./emailService');
const { generatePayslipPDF } = require('./payslipService');

/**
 * Initialize all cron jobs for the HR module.
 * Call this once after the database is connected in server.js.
 */
const initHRCronJobs = () => {
  // ── 1st of every month at 00:05 → auto-generate payroll ──────────────────
  cron.schedule('5 0 1 * *', async () => {
    console.log('[HR Cron] Generating monthly payroll...');
    try {
      const now = new Date();
      // Generate for PREVIOUS month
      let month = now.getMonth(); // 0-indexed, so this is previous month
      let year = now.getFullYear();
      if (month === 0) { month = 12; year -= 1; } // January edge case

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
      console.log(`[HR Cron] Payroll generated for ${allStaff.length} staff (${month}/${year})`);
    } catch (err) {
      console.error('[HR Cron] Payroll generation failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ── 1st of every month at 09:00 → auto-send payslip emails ───────────────
  cron.schedule('0 9 1 * *', async () => {
    console.log('[HR Cron] Sending payslip emails...');
    try {
      const now = new Date();
      let month = now.getMonth();
      let year = now.getFullYear();
      if (month === 0) { month = 12; year -= 1; }

      const payrolls = await HRPayroll.find({ month, year, payslipSent: false })
        .populate('staff', 'name email phone designation department joiningDate baseSalary');

      let sent = 0;
      for (const payroll of payrolls) {
        try {
          if (!payroll.staff?.email) continue;
          const pdfBuffer = await generatePayslipPDF(payroll);
          await sendPayslipEmail(payroll.staff.email, payroll.staff.name, payroll, pdfBuffer);
          payroll.payslipSent = true;
          payroll.payslipSentAt = new Date();
          await payroll.save();
          sent++;
        } catch (emailErr) {
          console.error(`[HR Cron] Failed to send to ${payroll.staff?.email}:`, emailErr.message);
        }
      }
      console.log(`[HR Cron] Payslip emails sent: ${sent}`);
    } catch (err) {
      console.error('[HR Cron] Email sending failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[HR Cron] Jobs initialized (payroll gen: 1st 00:05, emails: 1st 09:00)');
};

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Expiry Reminder Cron
// Runs every day at 08:00 — checks all restaurants expiring in ≤3 days
// ─────────────────────────────────────────────────────────────────────────────
const initSubscriptionCronJobs = () => {
  const Restaurant = require('../models/Restaurant');
  const nodemailer = require('nodemailer');

  const sendReminderEmail = async (toEmail, restaurantName, daysLeft, expiryDate) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    const { sendGenericEmail } = require('./emailService');
    const subject = `⚠️ Subscription Expiring in ${daysLeft} Day(s) — ${restaurantName}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#f72585">Subscription Expiry Reminder</h2>
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

  cron.schedule('0 8 * * *', async () => {
    console.log('[Subscription Cron] Checking subscription expiries...');
    try {
      const now = new Date();
      const in3Days = new Date(now);
      in3Days.setDate(in3Days.getDate() + 3);

      // Find all active restaurants expiring within 3 days
      const restaurants = await Restaurant.find({
        subscriptionStatus: 'active',
        subscriptionExpiry: { $lte: in3Days, $gte: now },
      });

      for (const r of restaurants) {
        const msLeft = r.subscriptionExpiry - now;
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

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

      // Mark expired subscriptions
      const expired = await Restaurant.updateMany(
        { subscriptionStatus: 'active', subscriptionExpiry: { $lt: now } },
        { $set: { subscriptionStatus: 'expired' } }
      );
      if (expired.modifiedCount > 0)
        console.log(`[Subscription Cron] Marked ${expired.modifiedCount} subscription(s) as expired`);

    } catch (err) {
      console.error('[Subscription Cron] Error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[Subscription Cron] Jobs initialized (daily 08:00)');
};

module.exports = { initHRCronJobs, initSubscriptionCronJobs };
