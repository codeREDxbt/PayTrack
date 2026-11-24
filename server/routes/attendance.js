/**
 * Attendance reads and writes.
 *
 * Route order matters: Express-style routers would let `/attendance/summary`
 * match `/attendance/:id`, so the literal report paths are registered first
 * and the `:id` pattern is numeric-only by contract (non-numeric ids 404).
 */
import { conflict, forbidden, notFound, validationError } from '../errors.js';
import { isStaff } from '../auth.js';
import {
  ATTENDANCE_STATUSES, hoursBetween, optionalTime, parseMonth, requireEnum,
  requireInteger, requireIsoDate, requireNumber, requireObject, rejectUnknownFields
} from '../validate.js';
import { toAttendance } from '../serializers.js';
import { requireNumericId } from './employees.js';
import { hasView } from '../db.js';

const WRITE_FIELDS = ['employeeId', 'date', 'status', 'checkInTime', 'checkOutTime', 'hoursWorked', 'overtimeHours'];
const PATCH_FIELDS = ['status', 'checkInTime', 'checkOutTime', 'hoursWorked', 'overtimeHours'];

const SELECT = `
  SELECT a.attendance_id, a.employee_id, a.attendance_date, a.status, a.check_in_time,
         a.check_out_time, a.hours_worked, a.overtime_hours, a.is_late, a.late_minutes,
         e.first_name || ' ' || e.last_name AS employee_name, e.department
  FROM Attendance a
  JOIN Employee e ON e.employee_id = a.employee_id
`;

function readOne(db, id) {
  const row = db.prepare(`${SELECT} WHERE a.attendance_id = ?`).get(id);
  return row ? toAttendance(row) : null;
}

/** hours_worked is derived when both punches are present and not supplied. */
function resolveHours(status, checkIn, checkOut, supplied) {
  if (supplied !== undefined) return requireNumber(supplied, 'hoursWorked', { min: 0, max: 24 });
  if (checkIn && checkOut && status !== 'ABSENT') {
    if (checkOut <= checkIn) throw validationError('checkOutTime must be after checkInTime', { field: 'checkOutTime' });
    return hoursBetween(checkIn, checkOut);
  }
  return 0;
}

export function registerAttendanceRoutes(add) {
  // ---- Staff reports (registered before /:id so the literals win) ----------
  add('staff', 'GET', '/api/attendance/summary', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month');
    // Phase 2 view columns: attendance_year / attendance_month ('2026' / '09').
    const rows = ctx.db.prepare(`
      SELECT employee_id, employee_name, department, role,
             attendance_year || '-' || attendance_month AS month_key,
             total_logged_days, present_days, half_days, leave_days, absent_days,
             holiday_days, total_overtime_hours, total_late_marks
      FROM vw_employee_attendance_monthly_summary
      WHERE attendance_year = ? AND attendance_month = ?
      ORDER BY employee_id
    `).all(String(month.year), String(month.month).padStart(2, '0'));
    return { status: 200, data: { month: month.key, attendance: rows } };
  });

  add('staff', 'GET', '/api/attendance/late', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month');
    // Reports sequence could not load database/reports.sql; use the base table.
    const rows = hasView(ctx.db, 'vw_rpt_late_marks')
      ? ctx.db.prepare(`
          SELECT attendance_id, employee_id, employee_name, department, attendance_date,
                 day_of_week_name, check_in_time, late_minutes
          FROM vw_rpt_late_marks
          WHERE month_key = ?
          ORDER BY attendance_date, employee_id
        `).all(month.key)
      : ctx.db.prepare(`
          SELECT a.attendance_id, a.employee_id,
                 e.first_name || ' ' || e.last_name AS employee_name, e.department,
                 a.attendance_date, NULL AS day_of_week_name, a.check_in_time, a.late_minutes
          FROM Attendance a JOIN Employee e ON e.employee_id = a.employee_id
          WHERE a.is_late = 1 AND a.attendance_date >= ? AND a.attendance_date < ?
          ORDER BY a.attendance_date, a.employee_id
        `).all(month.start, month.nextStart);
    return { status: 200, data: { month: month.key, lateMarks: rows } };
  });

  // ---- List ---------------------------------------------------------------
  add('any', 'GET', '/api/attendance', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month', { required: false });
    const params = [month.start, month.nextStart];
    const where = ['a.attendance_date >= ?', 'a.attendance_date < ?'];
    if (isStaff(ctx.user)) {
      const employeeId = ctx.query.get('employeeId');
      if (employeeId) {
        where.push('a.employee_id = ?');
        params.push(requireInteger(Number(employeeId), 'employeeId', { min: 1 }));
      }
    } else {
      // Scoped, never merely filtered: a query parameter cannot widen it.
      where.push('a.employee_id = ?');
      params.push(ctx.user.employeeId);
    }
    const rows = ctx.db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY a.attendance_date, a.employee_id`).all(...params);
    return { status: 200, data: { month: month.key, attendance: rows.map(toAttendance) } };
  });

  // Per-employee attendance for a month
  add('any', 'GET', '/api/employees/:id/attendance', (ctx) => {
    const employeeId = requireNumericId(ctx.params.id, 'id');
    if (!isStaff(ctx.user) && employeeId !== ctx.user.employeeId) throw forbidden('You may only view your own attendance');
    const exists = ctx.db.prepare('SELECT 1 AS ok FROM Employee WHERE employee_id = ?').get(employeeId);
    if (!exists) throw notFound('Employee not found');
    const month = parseMonth(ctx.query.get('month'), 'month', { required: false });
    const rows = ctx.db.prepare(`${SELECT}
      WHERE a.employee_id = ? AND a.attendance_date >= ? AND a.attendance_date < ?
      ORDER BY a.attendance_date`).all(employeeId, month.start, month.nextStart);
    return { status: 200, data: { month: month.key, employeeId, attendance: rows.map(toAttendance) } };
  });

  // ---- Create -------------------------------------------------------------
  add('staff', 'POST', '/api/attendance', (ctx) => {
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, WRITE_FIELDS, 'create attendance');

    const employeeId = requireInteger(body.employeeId, 'employeeId', { min: 1 });
    const date = requireIsoDate(body.date, 'date');
    const status = requireEnum(body.status ?? 'PRESENT', ATTENDANCE_STATUSES, 'status');
    const checkIn = optionalTime(body.checkInTime, 'checkInTime') ?? null;
    const checkOut = optionalTime(body.checkOutTime, 'checkOutTime') ?? null;
    if (!ctx.db.prepare('SELECT 1 AS ok FROM Employee WHERE employee_id = ?').get(employeeId)) throw notFound('Employee not found');

    // A duplicate is a client conflict (409), checked up front so the UNIQUE
    // constraint never surfaces as a generic DB_CONSTRAINT.
    if (ctx.db.prepare('SELECT 1 AS ok FROM Attendance WHERE employee_id = ? AND attendance_date = ?').get(employeeId, date)) {
      throw conflict('Attendance already exists for this employee on this date');
    }

    const hours = resolveHours(status, checkIn, checkOut, body.hoursWorked);
    const overtime = body.overtimeHours === undefined ? 0 : requireNumber(body.overtimeHours, 'overtimeHours', { min: 0, max: 16 });

    const result = ctx.db.prepare(`
      INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked, overtime_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(employeeId, date, status, checkIn, checkOut, hours, overtime);
    return { status: 201, data: { attendance: readOne(ctx.db, Number(result.lastInsertRowid)) } };
  });

  // ---- Update -------------------------------------------------------------
  add('staff', 'PATCH', '/api/attendance/:id', (ctx) => {
    const id = requireNumericId(ctx.params.id, 'id');
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, PATCH_FIELDS, 'update attendance');
    const existing = ctx.db.prepare('SELECT * FROM Attendance WHERE attendance_id = ?').get(id);
    if (!existing) throw notFound('Attendance record not found');

    const status = body.status === undefined ? existing.status : requireEnum(body.status, ATTENDANCE_STATUSES, 'status');
    const checkIn = body.checkInTime === undefined ? existing.check_in_time : optionalTime(body.checkInTime, 'checkInTime');
    const checkOut = body.checkOutTime === undefined ? existing.check_out_time : optionalTime(body.checkOutTime, 'checkOutTime');
    const hours = body.hoursWorked !== undefined
      ? requireNumber(body.hoursWorked, 'hoursWorked', { min: 0, max: 24 })
      : resolveHours(status, checkIn, checkOut, undefined);
    const overtime = body.overtimeHours === undefined
      ? Number(existing.overtime_hours)
      : requireNumber(body.overtimeHours, 'overtimeHours', { min: 0, max: 16 });

    ctx.db.prepare(`
      UPDATE Attendance
      SET status = ?, check_in_time = ?, check_out_time = ?, hours_worked = ?, overtime_hours = ?
      WHERE attendance_id = ?
    `).run(status, checkIn, checkOut, hours, overtime, id);
    return { status: 200, data: { attendance: readOne(ctx.db, id) } };
  });
}
