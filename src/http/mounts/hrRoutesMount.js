const hrStaffRoutes = require("../../../routes/hrStaffRoutes");
const hrAttendanceRoutes = require("../../../routes/hrAttendanceRoutes");
const hrLeaveRoutes = require("../../../routes/hrLeaveRoutes");
const hrShiftRoutes = require("../../../routes/hrShiftRoutes");
const hrPayrollRoutes = require("../../../routes/hrPayrollRoutes");
const { tenantMiddleware } = require("../../../middleware/tenantMiddleware");

function mountHrRoutes(app) {
  app.use("/api/hr/staff", tenantMiddleware, hrStaffRoutes);
  app.use("/api/hr/attendance", tenantMiddleware, hrAttendanceRoutes);
  app.use("/api/hr/leaves", tenantMiddleware, hrLeaveRoutes);
  app.use("/api/hr/shifts", tenantMiddleware, hrShiftRoutes);
  app.use("/api/hr/payroll", tenantMiddleware, hrPayrollRoutes);
}

module.exports = { mountHrRoutes };
