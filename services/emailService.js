const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');

const dnsLookup = promisify(dns.lookup);

/**
 * Create a reusable transporter using environment SMTP config.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env
 * For Gmail: use smtp.gmail.com, port 587, and an App Password.
 */
const createTransporter = async (port) => {
  const smtpPort = port || Number(process.env.SMTP_PORT) || 465;
  const isSecure = smtpPort === 465;
  const hostname = process.env.SMTP_HOST || 'smtp.gmail.com';

  // Explicitly resolve to an IPv4 address to avoid ENETUNREACH on IPv6-disabled hosts
  let resolvedHost = hostname;
  try {
    const { address } = await dnsLookup(hostname, { family: 4 });
    resolvedHost = address;
  } catch (_) {
    // fall back to the hostname if resolution fails
  }

  return nodemailer.createTransport({
    host: resolvedHost,
    port: smtpPort,
    secure: isSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
      servername: hostname, // required for TLS SNI when host is an IP address
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 45000,
  });
};

/**
 * Send payslip via email with PDF attachment.
 * @param {string} toEmail - Recipient email
 * @param {string} staffName - Staff full name
 * @param {Object} payroll - Payroll document (populated)
 * @param {Buffer} pdfBuffer - Generated PDF buffer
 */
const sendPayslipEmail = async (toEmail, staffName, payroll, pdfBuffer) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[EmailService] SMTP credentials not configured. Skipping email.');
    return;
  }

  const monthName = new Date(2000, payroll.month - 1).toLocaleString('en', { month: 'long' });
  const companyName = process.env.COMPANY_NAME || 'Restaurant Management System';
  const companyEmail = process.env.COMPANY_EMAIL || process.env.SMTP_USER;

  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: #fff; padding: 32px 40px; }
    .header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
    .header p { margin: 0; opacity: 0.85; font-size: 14px; }
    .body { padding: 32px 40px; }
    .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
    .info-box { background: #f8fafc; border-left: 4px solid #2563eb; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
    .info-box p { margin: 4px 0; font-size: 14px; color: #555; }
    .info-box strong { color: #1e293b; }
    .salary-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .salary-table th { background: #1e3a5f; color: #fff; padding: 10px 14px; text-align: left; font-size: 13px; }
    .salary-table td { padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #e2e8f0; color: #374151; }
    .salary-table tr:last-child td { border-bottom: none; }
    .net-row td { background: #eff6ff; font-weight: 700; color: #1d4ed8; font-size: 15px; }
    .footer { background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    .note { background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #713f12; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${companyName}</h1>
      <p>Payslip for ${monthName} ${payroll.year}</p>
    </div>
    <div class="body">
      <p class="greeting">Dear <strong>${staffName}</strong>,</p>
      <p style="color:#64748b;font-size:14px;margin-bottom:20px;">
        Please find your payslip for <strong>${monthName} ${payroll.year}</strong> attached to this email.
        A summary is also provided below for your reference.
      </p>

      <div class="info-box">
        <p><strong>Employee:</strong> ${staffName}</p>
        <p><strong>Designation:</strong> ${payroll.staff?.designation || '—'}</p>
        <p><strong>Department:</strong> ${payroll.staff?.department || '—'}</p>
        <p><strong>Pay Period:</strong> ${monthName} ${payroll.year}</p>
      </div>

      <table class="salary-table">
        <thead>
          <tr><th>Description</th><th>Amount (₹)</th></tr>
        </thead>
        <tbody>
          <tr><td>Base Salary</td><td>₹${payroll.baseSalary.toLocaleString()}</td></tr>
          <tr><td>Absent Days (${payroll.absentDays})</td><td style="color:#dc2626;">- ₹${payroll.leaveDeduction.toLocaleString()}</td></tr>
          ${payroll.bonus > 0 ? `<tr><td>Bonus</td><td style="color:#16a34a;">+ ₹${payroll.bonus.toLocaleString()}</td></tr>` : ''}
          ${payroll.overtime > 0 ? `<tr><td>Overtime Pay</td><td style="color:#16a34a;">+ ₹${payroll.overtime.toLocaleString()}</td></tr>` : ''}
          <tr class="net-row"><td>Net Salary</td><td>₹${payroll.netSalary.toLocaleString()}</td></tr>
        </tbody>
      </table>

      <div class="note">
        This is a computer-generated payslip. Please review the attached PDF for the official record.
        Contact HR for any discrepancies.
      </div>
    </div>
    <div class="footer">
      <p>${companyName} &bull; Automated HR System</p>
      <p>This email was sent automatically. Do not reply.</p>
    </div>
  </div>
</body>
</html>`;

  const filename = `payslip-${staffName.replace(/\s/g, '_')}-${monthName}-${payroll.year}.pdf`;

  console.log(`[EmailService] Attempting to send email to ${toEmail}...`);

  const mailOptions = {
    from: `"${companyName}" <${companyEmail}>`,
    to: toEmail,
    subject: `Payslip for ${monthName} ${payroll.year} – ${companyName}`,
    html: htmlTemplate,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  // Try primary port first, then fallback ports
  const primaryPort = Number(process.env.SMTP_PORT) || 465;
  const fallbackPorts = primaryPort === 465 ? [587] : [465];
  const portsToTry = [primaryPort, ...fallbackPorts];

  for (let i = 0; i < portsToTry.length; i++) {
    const port = portsToTry[i];
    try {
      const transporter = await createTransporter(port);
      await transporter.sendMail(mailOptions);
      console.log(`[EmailService] Payslip sent successfully to ${toEmail} via port ${port}`);
      return;
    } catch (error) {
      const isLastAttempt = i === portsToTry.length - 1;
      if (isLastAttempt) {
        console.error(`[EmailService] Failed to send email to ${toEmail} on all ports. Last error:`, error.message);
        // Do not rethrow — email failure should not block payroll processing
      } else {
        console.warn(`[EmailService] Port ${port} failed (${error.code || error.message}), retrying with port ${portsToTry[i + 1]}...`);
      }
    }
  }
};

module.exports = { sendPayslipEmail };
