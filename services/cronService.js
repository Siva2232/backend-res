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

  // ── Daily at 00:01 → process recurring accounting transactions ──────────
  cron.schedule('1 0 * * *', async () => {
    try {
      const { processRecurring } = require('../controllers/recurringController');
      await processRecurring();
    } catch (err) {
      console.error('[Accounting Cron] Recurring failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });
};

module.exports = { initHRCronJobs };
