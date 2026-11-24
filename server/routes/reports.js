/**
 * Dashboard KPIs and the monthly department rollup.
 *
 * Both are computed from the base tables (with the report view used when it is
 * present) so the numbers are identical whether or not database/reports.sql has
 * landed.
 */
import { parseMonth } from '../validate.js';
import { hasView } from '../db.js';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function departmentRollup(db, month) {
  if (hasView(db, 'vw_rpt_department_rollup')) {
    return db.prepare('SELECT * FROM vw_rpt_department_rollup WHERE month_key = ? ORDER BY department').all(month.key);
  }
  // Fallback — same shape as vw_rpt_department_rollup.
  return db.prepare(`
    SELECT e.department,
           CAST(substr(a.attendance_date, 1, 7) AS TEXT) AS month_key,
           0 AS employees_logged,
           SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
           0 AS half_days,
           0 AS leave_days,
           SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
           SUM(CASE WHEN a.status = 'HOLIDAY' THEN 1 ELSE 0 END) AS holiday_days,
           ROUND(SUM(a.overtime_hours), 2) AS overtime_hours,
           SUM(a.is_late) AS late_marks,
           NULL AS avg_attendance_percentage,
           0 AS payroll_slips
    FROM Attendance a JOIN Employee e ON e.employee_id = a.employee_id
    WHERE a.attendance_date >= ? AND a.attendance_date < ?
    GROUP BY e.department
    ORDER BY e.department
  `).all(month.start, month.nextStart);
}

function payrollTotals(db, month) {
  const row = db.prepare(`
    SELECT COUNT(*) AS slips,
           SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) AS draft,
           SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid,
           ROUND(SUM(gross_salary), 2) AS gross,
           ROUND(SUM(tax_deduction), 2) AS tax,
           ROUND(SUM(net_salary), 2) AS net
    FROM Payroll WHERE pay_period_year = ? AND pay_period_month = ?
  `).get(month.year, month.month);
  return {
    slips: Number(row.slips || 0),
    draft: Number(row.draft || 0),
    approved: Number(row.approved || 0),
    paid: Number(row.paid || 0),
    grossSalary: round2(row.gross),
    taxDeduction: round2(row.tax),
    netSalary: round2(row.net)
  };
}

export function registerReportRoutes(add) {
  add('any', 'GET', '/api/me/dashboard', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month', { required: false });
    const staff = ctx.user.isStaff;
    const employeeId = ctx.user.employeeId;

    const where = staff ? ['a.attendance_date >= ?', 'a.attendance_date < ?'] : ['a.employee_id = ?', 'a.attendance_date >= ?', 'a.attendance_date < ?'];
    const params = staff ? [month.start, month.nextStart] : [employeeId, month.start, month.nextStart];
    const att = ctx.db.prepare(`
      SELECT SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
             SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent,
             SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS leave_days,
             SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_days,
             SUM(a.is_late) AS late_marks,
             ROUND(SUM(a.overtime_hours), 2) AS overtime_hours,
             COUNT(DISTINCT a.employee_id) AS employees
      FROM Attendance a WHERE ${where.join(' AND ')}
    `).get(...params);

    const employeeFilter = staff ? '' : 'AND p.employee_id = ?';
    const payParams = staff ? [month.year, month.month] : [month.year, month.month, employeeId];
    const pay = ctx.db.prepare(`
      SELECT COUNT(*) AS slips,
             SUM(CASE WHEN p.status = 'PAID' THEN 1 ELSE 0 END) AS paid,
             ROUND(SUM(CASE WHEN p.status = 'PAID' THEN p.net_salary ELSE 0 END), 2) AS paid_net
      FROM Payroll p WHERE p.pay_period_year = ? AND p.pay_period_month = ? ${employeeFilter}
    `).get(...payParams);

    const data = {
      scope: staff ? 'ORG' : 'SELF',
      month: month.key,
      headcount: staff
        ? Number(ctx.db.prepare("SELECT COUNT(*) AS c FROM Employee WHERE status = 'ACTIVE'").get().c)
        : 1,
      employeesLogged: Number(att.employees || 0),
      attendance: {
        presentDays: Number(att.present || 0),
        absentDays: Number(att.absent || 0),
        leaveDays: Number(att.leave_days || 0),
        halfDays: Number(att.half_days || 0),
        lateMarks: Number(att.late_marks || 0),
        overtimeHours: round2(att.overtime_hours)
      },
      payroll: {
        slips: Number(pay.slips || 0),
        paidSlips: Number(pay.paid || 0),
        paidNetSalary: round2(pay.paid_net)
      }
    };
    // Personnel directory numbers are only meaningful (and only permitted) for staff.
    if (staff) {
      data.departments = Number(ctx.db.prepare('SELECT COUNT(DISTINCT department) AS c FROM Employee').get().c);
    }
    return { status: 200, data };
  });

  add('staff', 'GET', '/api/reports/monthly', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month', { required: false });
    const departments = departmentRollup(ctx.db, month);
    const totals = payrollTotals(ctx.db, month);
    const attendanceTotals = departments.reduce((acc, d) => ({
      presentDays: acc.presentDays + Number(d.present_days || 0),
      absentDays: acc.absentDays + Number(d.absent_days || 0),
      leaveDays: acc.leaveDays + Number(d.leave_days || 0),
      lateMarks: acc.lateMarks + Number(d.late_marks || 0),
      overtimeHours: round2(acc.overtimeHours + Number(d.overtime_hours || 0))
    }), { presentDays: 0, absentDays: 0, leaveDays: 0, lateMarks: 0, overtimeHours: 0 });
    return {
      status: 200,
      data: {
        month: month.key,
        departments,
        totals: { ...attendanceTotals, payroll: totals }
      }
    };
  });
}
