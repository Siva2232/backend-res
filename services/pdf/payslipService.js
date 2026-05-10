const PDFDocument = require('pdfkit');

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * Generates a professional payslip PDF for a payroll record.
 * @param {Object} payroll - Populated payroll document
 * @returns {Promise<Buffer>} PDF as a buffer
 */
const generatePayslipPDF = (payroll) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const companyName = process.env.COMPANY_NAME || 'Restaurant Management System';
      const staff = payroll.staff;
      const monthName = MONTHS[payroll.month - 1];
      const W = 495; // usable width

      // ── Header ────────────────────────────────────────────────────────────
      doc.rect(50, 50, W, 80).fill('#1e3a5f');
      doc.fillColor('#ffffff')
        .font('Helvetica-Bold').fontSize(20).text(companyName, 70, 68)
        .font('Helvetica').fontSize(11).text(`Payslip for ${monthName} ${payroll.year}`, 70, 96);

      doc.moveDown(4);

      // ── Employee Info Block ───────────────────────────────────────────────
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text('EMPLOYEE DETAILS', 50, 150);
      doc.moveTo(50, 165).lineTo(545, 165).strokeColor('#e2e8f0').stroke();

      const infoY = 172;
      const col1 = 50, col2 = 300;
      const labelColor = '#64748b', valueColor = '#1e293b';
      const rowH = 18;

      const addInfoRow = (label, value, x, y) => {
        doc.font('Helvetica').fontSize(9).fillColor(labelColor).text(label, x, y);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(valueColor).text(value || '—', x + 90, y);
      };

      addInfoRow('Employee Name:', staff?.name || '—', col1, infoY);
      addInfoRow('Email:', staff?.email || '—', col1, infoY + rowH);
      addInfoRow('Phone:', staff?.phone || '—', col1, infoY + rowH * 2);
      addInfoRow('Designation:', staff?.designation || '—', col2, infoY);
      addInfoRow('Department:', staff?.department || '—', col2, infoY + rowH);
      addInfoRow('Joining Date:', staff?.joiningDate
        ? new Date(staff.joiningDate).toLocaleDateString('en-IN')
        : '—', col2, infoY + rowH * 2);

      // ── Attendance Summary ────────────────────────────────────────────────
      const attY = infoY + rowH * 4;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text('ATTENDANCE SUMMARY', col1, attY);
      doc.moveTo(50, attY + 15).lineTo(545, attY + 15).strokeColor('#e2e8f0').stroke();

      const attRowY = attY + 22;
      addInfoRow('Working Days:', String(payroll.workingDays), col1, attRowY);
      addInfoRow('Present Days:', String(payroll.presentDays), col2, attRowY);
      addInfoRow('Absent Days:', String(payroll.absentDays), col1, attRowY + rowH);
      addInfoRow('Leave Days:', String(payroll.leaveDays), col2, attRowY + rowH);

      // ── Earnings & Deductions Table ───────────────────────────────────────
      const tableY = attRowY + rowH * 3;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text('SALARY BREAKDOWN', col1, tableY);
      doc.moveTo(50, tableY + 15).lineTo(545, tableY + 15).strokeColor('#e2e8f0').stroke();

      // Table header
      const thY = tableY + 22;
      doc.rect(50, thY, W, 22).fill('#1e3a5f');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
        .text('DESCRIPTION', 60, thY + 7)
        .text('AMOUNT', 460, thY + 7, { align: 'right', width: 75 });

      const rows = [
        ['Base Salary', `INR ${payroll.baseSalary.toLocaleString('en-IN')}`, false],
        [`Deduction (${payroll.absentDays} absent + ${payroll.leaveDays} leave days)`,
          `- INR ${payroll.leaveDeduction.toLocaleString('en-IN')}`, true],
        ...(payroll.bonus > 0 ? [['Bonus', `+ INR ${payroll.bonus.toLocaleString('en-IN')}`, false]] : []),
        ...(payroll.overtime > 0 ? [['Overtime Pay', `+ INR ${payroll.overtime.toLocaleString('en-IN')}`, false]] : []),
      ];

      let rowY = thY + 22;
      rows.forEach(([label, amount, isDeduction], i) => {
        const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        doc.rect(50, rowY, W, 20).fill(bg);
        doc.font('Helvetica').fontSize(9).fillColor(isDeduction ? '#dc2626' : '#1e293b')
          .text(label, 60, rowY + 6);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(isDeduction ? '#dc2626' : '#1e293b')
          .text(amount, 460, rowY + 6, { align: 'right', width: 75 });
        rowY += 20;
      });

      // Net salary row
      doc.rect(50, rowY, W, 26).fill('#1e3a5f');
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
        .text('NET SALARY', 60, rowY + 8)
        .text(`INR ${payroll.netSalary.toLocaleString('en-IN')}`, 460, rowY + 8, { align: 'right', width: 75 });
      rowY += 26;

      // ── Status Badge ──────────────────────────────────────────────────────
      const statusColor = payroll.status === 'paid' ? '#16a34a' : '#d97706';
      const statusY = rowY + 16;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
        .text(`Payment Status: ${payroll.status.toUpperCase()}`, col1, statusY);
      if (payroll.paidAt) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b')
          .text(`Paid on: ${new Date(payroll.paidAt).toLocaleDateString('en-IN')}`, col1, statusY + 14);
      }

      // ── Notes ─────────────────────────────────────────────────────────────
      if (payroll.notes) {
        const noteY = statusY + 36;
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Note: ${payroll.notes}`, col1, noteY);
      }

      // ── Footer ────────────────────────────────────────────────────────────
      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e2e8f0').stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
        .text(
          `This is a computer-generated document and does not require a signature. | Generated on ${new Date().toLocaleDateString('en-IN')} | ${companyName}`,
          50, footerY + 8, { align: 'center', width: W }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generatePayslipPDF };
