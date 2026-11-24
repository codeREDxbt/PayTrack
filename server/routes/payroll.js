/**
 * Payroll: generation, listing, payslips and the status state machine.
 *
 * POST /payroll/generate recomputes a period from
 * vw_payroll_procedural_computation inside one BEGIN IMMEDIATE ... COMMIT.
 * Any failure rolls the whole batch back (the suite forces a failure and
 * asserts nothing was written). Recalculation only ever targets DRAFT rows:
 * if the period already holds APPROVED/PAID rows the request is a 409 before
 * anything is written.
 */
import { conflict, forbidden, fromDatabaseError, notFound, validationError } from '../errors.js';
import { isStaff } from '../auth.js';
import { parseMonth, requireEnum, requireObject, rejectUnknownFields, isValidIsoDate } from '../validate.js';
import {
  PAYROLL_SUMMARY_COLUMNS, payslip, payslipFromPayroll, payrollLineItems, toPayrollSummary
} from '../serializers.js';
import { requireNumericId } from './employees.js';

// The computation view cannot be updated in place: SQLite would happily read
// the row being rewritten and the join predicate (keyed on Payroll) keeps
// re-matching it, duplicating values across employees. So every computed row
// is staged once, before any Payroll write.
const COMPUTATION_STAGE = `
  CREATE TEMP TABLE IF NOT EXISTS _paytrack_computed AS
    SELECT * FROM vw_payroll_procedural_computation WHERE 0
`;

const COMPUTATION_INSERT = `
  INSERT INTO Payroll (
    employee_id, salary_id, pay_period_month, pay_period_year,
    working_days, present_days, absent_days, half_days, leave_days,
    overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
    gross_salary, tax_deduction, unpaid_leave_deduction, other_deductions,
    net_salary, status
  )
  SELECT employee_id, salary_id, pay_period_month, pay_period_year,
         working_days, present_days, absent_days, half_days, leave_days,
         overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
         gross_salary, tax_deduction, unpaid_leave_deduction, other_deductions,
         net_salary, 'DRAFT'
  FROM temp._paytrack_computed c
  WHERE c.pay_period_year = ? AND c.pay_period_month = ?
    AND NOT EXISTS (
      SELECT 1 FROM Payroll p
      WHERE p.employee_id = c.employee_id
        AND p.pay_period_year = c.pay_period_year
        AND p.pay_period_month = c.pay_period_month
    )
`;

const COMPUTATION_UPDATE = `
  UPDATE Payroll
  SET working_days = c.working_days,
      present_days = c.present_days,
      absent_days = c.absent_days,
      half_days = c.half_days,
      leave_days = c.leave_days,
      overtime_hours = c.overtime_hours,
      base_salary_earned = c.base_salary_earned,
      allowances_earned = c.allowances_earned,
      overtime_pay = c.overtime_pay,
      gross_salary = c.gross_salary,
      tax_deduction = c.tax_deduction,
      unpaid_leave_deduction = c.unpaid_leave_deduction,
      other_deductions = c.other_deductions,
      net_salary = c.net_salary,
      updated_at = CURRENT_TIMESTAMP
  FROM temp._paytrack_computed c
  WHERE Payroll.employee_id = c.employee_id
    AND Payroll.pay_period_year = c.pay_period_year
    AND Payroll.pay_period_month = c.pay_period_month
    AND c.pay_period_year = ?
    AND c.pay_period_month = ?
    AND Payroll.status = 'DRAFT'
`;

function periodsWithSlips(db, year, month) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status <> 'DRAFT' THEN 1 ELSE 0 END), 0) AS frozen
    FROM Payroll
    WHERE pay_period_year = ? AND pay_period_month = ?
  `).get(year, month);
  return { total: Number(row.total), frozen: Number(row.frozen) };
}

function payslipFor(db, payrollId) {
  if (db.hasSlipView) {
    const slip = db.prepare('SELECT * FROM vw_rpt_salary_slip WHERE payroll_id = ?').get(payrollId);
    if (!slip) return null;
    const items = db.prepare('SELECT * FROM vw_rpt_salary_slip_line_items WHERE payroll_id = ? ORDER BY sort_order').all(payrollId);
    return payslip(slip, items);
  }
  // Fallback — mirrors vw_rpt_salary_slip when database/reports.sql is absent.
  const row = db.prepare(`
    SELECT p.*, e.first_name, e.last_name, e.email, e.department, e.role,
           s.base_salary, s.hra, s.allowances
    FROM Payroll p
    JOIN Employee e ON e.employee_id = p.employee_id
    JOIN Salary s ON s.salary_id = p.salary_id
    WHERE p.payroll_id = ?
  `).get(payrollId);
  if (!row) return null;
  return payslipFromPayroll(row, row, payrollLineItems(row));
}

function payrollOwnerAndStatus(db, payrollId) {
  const row = db.prepare(`
    SELECT p.payroll_id, p.employee_id, p.status, p.payment_date
    FROM Payroll p WHERE p.payroll_id = ?
  `).get(payrollId);
  if (!row) return null;
  return { employeeId: Number(row.employee_id), status: row.status, paymentDate: row.payment_date };
}

export function registerPayrollRoutes(add) {
  add('staff', 'POST', '/api/payroll/generate', (ctx) => {
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, ['month'], 'payroll generation');
    const month = parseMonth(body.month, 'month', { required: true });

    const db = ctx.db;
    const existing = periodsWithSlips(db, month.year, month.month);
    if (existing.frozen > 0) {
      throw conflict(`Payroll for ${month.key} is closed: ${existing.frozen} slip(s) are APPROVED or PAID. Only DRAFT periods can be recalculated.`);
    }

    const computed = db.prepare(`
      SELECT COUNT(*) AS c FROM vw_payroll_procedural_computation
      WHERE pay_period_year = ? AND pay_period_month = ?
    `).get(month.year, month.month);
    if (Number(computed.c) === 0) {
      throw validationError(`No attendance data exists for ${month.key}; nothing to compute`, { month: month.key });
    }

    const employeeId = Number(ctx.user.employeeId);
    db.exec('BEGIN IMMEDIATE');
    try {
      // Re-check under the write lock: a concurrent approval between the read
      // above and BEGIN would otherwise slip through.
      const locked = periodsWithSlips(db, month.year, month.month);
      if (locked.frozen > 0) throw conflict(`Payroll for ${month.key} is closed: slips are APPROVED or PAID.`);

      // Stage the computation once, then insert missing rows and refresh DRAFT
      // rows from the staged copy (Phase 4 trigger 5A still guards the insert).
      db.exec(COMPUTATION_STAGE);
      db.prepare(`DELETE FROM temp._paytrack_computed WHERE pay_period_year = ? AND pay_period_month = ?`).run(month.year, month.month);
      db.prepare(`
        INSERT INTO temp._paytrack_computed SELECT * FROM vw_payroll_procedural_computation
        WHERE pay_period_year = ? AND pay_period_month = ?
      `).run(month.year, month.month);
      db.prepare(COMPUTATION_INSERT).run(month.year, month.month);
      db.prepare(COMPUTATION_UPDATE).run(month.year, month.month);
      // Fault hook for the atomicity test (wired from server options only, never
      // from a request); when it throws, the ROLLBACK below must undo everything.
      if (ctx.hooks?.payrollGenerate) ctx.hooks.payrollGenerate({ db, month, employeeId });

      const rows = db.prepare(`
        SELECT ${PAYROLL_SUMMARY_COLUMNS}
        FROM Payroll p JOIN Employee e ON e.employee_id = p.employee_id
        WHERE p.pay_period_year = ? AND p.pay_period_month = ?
        ORDER BY p.employee_id
      `).all(month.year, month.month);
      db.exec('COMMIT');
      return {
        status: 200,
        data: {
          month: month.key,
          generated: rows.length,
          recalculated: existing.total,
          computedFrom: 'vw_payroll_procedural_computation',
          payroll: rows.map(toPayrollSummary)
        }
      };
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      // A foreign key on INSERT cannot come from user input here: every row is
      // derived from the same database. So any constraint failure inside this
      // transaction is the payroll policy (Phase 4 triggers 5A/5B) refusing
      // the write, which the contract reports as a closed/dirty period.
      throw fromDatabaseError(err, {
        triggerOverride: conflict(`Payroll for ${month.key} could not be regenerated: the period changed during generation (slips are no longer all DRAFT). No rows were written.`)
      });
    }
  });

  add('staff', 'GET', '/api/payroll', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month', { required: false });
    const status = ctx.query.get('status') || '';
    if (status) requireEnum(status, ['DRAFT', 'APPROVED', 'PAID'], 'status');
    const where = ['p.pay_period_year = ?', 'p.pay_period_month = ?'];
    const params = [month.year, month.month];
    if (status) {
      where.push('p.status = ?');
      params.push(status);
    }
    const rows = ctx.db.prepare(`
      SELECT ${PAYROLL_SUMMARY_COLUMNS}
      FROM Payroll p JOIN Employee e ON e.employee_id = p.employee_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.employee_id
    `).all(...params);
    const totals = rows.reduce((acc, r) => ({
      grossSalary: round2(acc.grossSalary + Number(r.gross_salary)),
      netSalary: round2(acc.netSalary + Number(r.net_salary)),
      taxDeduction: round2(acc.taxDeduction + Number(r.tax_deduction))
    }), { grossSalary: 0, netSalary: 0, taxDeduction: 0 });
    return { status: 200, data: { month: month.key, payroll: rows.map(toPayrollSummary), totals } };
  });

  add('any', 'GET', '/api/payroll/me', (ctx) => {
    const month = parseMonth(ctx.query.get('month'), 'month', { required: false });
    // Always the caller's own id, staff included: this route means "mine".
    const rows = ctx.db.prepare(`
      SELECT ${PAYROLL_SUMMARY_COLUMNS}
      FROM Payroll p JOIN Employee e ON e.employee_id = p.employee_id
      WHERE p.employee_id = ? AND p.pay_period_year = ? AND p.pay_period_month = ?
      ORDER BY p.employee_id
    `).all(ctx.user.employeeId, month.year, month.month);
    return { status: 200, data: { month: month.key, payroll: rows.map(toPayrollSummary) } };
  });

  add('any', 'GET', '/api/payroll/:id/payslip', (ctx) => {
    const payrollId = requireNumericId(ctx.params.id, 'id');
    // Ownership (from the owner column) decides 403 before existence is
    // revealed, so an EMPLOYEE gets one answer for "not yours" and "no such id".
    const owner = payrollOwnerAndStatus(ctx.db, payrollId);
    if (!isStaff(ctx.user)) {
      if (!owner || owner.employeeId !== ctx.user.employeeId) throw forbidden('You may only view your own payslips');
    }
    if (!owner) throw notFound('Payslip not found');
    const data = payslipFor(ctx.db, payrollId);
    if (!data) throw notFound('Payslip not found');
    return { status: 200, data: { payslip: data } };
  });

  add('staff', 'PATCH', '/api/payroll/:id/status', (ctx) => {
    const payrollId = requireNumericId(ctx.params.id, 'id');
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, ['status', 'paymentDate'], 'payroll status');
    const next = requireEnum(body.status, ['DRAFT', 'APPROVED', 'PAID'], 'status');
    if (body.paymentDate !== undefined && body.paymentDate !== null) {
      if (!isValidIsoDate(body.paymentDate)) throw validationError('paymentDate must be YYYY-MM-DD', { field: 'paymentDate' });
    }
    const owner = payrollOwnerAndStatus(ctx.db, payrollId);
    if (!owner) throw notFound('Payroll record not found');

    const transitions = { DRAFT: 'APPROVED', APPROVED: 'PAID' };
    if (transitions[owner.status] !== next) {
      throw validationError(`Illegal payroll status transition ${owner.status} -> ${next}`, {
        current: owner.status,
        allowedNext: transitions[owner.status] ?? null
      });
    }

    // Phase 4 trigger 5B requires a payment date when moving to PAID.
    let paymentDate = body.paymentDate ?? null;
    if (next === 'PAID' && !paymentDate) paymentDate = new Date().toISOString().slice(0, 10);
    if (next === 'APPROVED' && paymentDate) throw validationError('paymentDate is only set when marking payroll PAID', { field: 'paymentDate' });

    ctx.db.prepare('UPDATE Payroll SET status = ?, payment_date = ?, updated_at = CURRENT_TIMESTAMP WHERE payroll_id = ?')
      .run(next, paymentDate, payrollId);
    const after = payrollOwnerAndStatus(ctx.db, payrollId);
    return { status: 200, data: { payrollId, status: after.status, paymentDate: after.paymentDate } };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
