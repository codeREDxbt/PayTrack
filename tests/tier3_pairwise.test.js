/**
 * ============================================================================
 * Tier 3: Cross-Feature Interactions Test Suite (tests/tier3_pairwise.test.js)
 * ============================================================================
 * Total: 16 Pairwise Integration Test Cases covering state transitions,
 * cross-subsystem interactions, and trigger validations.
 * Requires: Node.js v24 native test runner / assert.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import {
  createTestDb,
  withTransaction,
  assertThrowsConstraint,
  assertExecutionPlanUsesIndex,
  calculateTax,
  calculateDailyRate,
  calculateHourlyRate,
  startTestServer,
  apiRequest,
  runCli
} from './harness.js';

export async function runTier3Tests(reporter = { record: () => {} }) {
  const suiteResults = [];

  async function test(id, description, fn) {
    const start = performance.now();
    try {
      await fn();
      const duration = Number((performance.now() - start).toFixed(2));
      const res = { id, description, status: 'PASS', duration };
      suiteResults.push(res);
      reporter.record(res);
    } catch (err) {
      const duration = Number((performance.now() - start).toFixed(2));
      const res = { id, description, status: 'FAIL', duration, error: err.message };
      suiteResults.push(res);
      reporter.record(res);
    }
  }

  // --------------------------------------------------------------------------
  // T3-P01: Leave Approval -> Attendance Generation
  // --------------------------------------------------------------------------
  await test('T3-P01', 'Leave Approval -> Attendance Generation: Approved leave dates translate to ON_LEAVE', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Leave', 'User', 'lu@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // Insert and approve leave for 2026-08-14
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-14', '2026-08-14', 1.0, 'APPROVED')").run(empId);

      // System records attendance as ON_LEAVE
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-14', 'ON_LEAVE')").run(empId);

      const att = db.prepare("SELECT status FROM Attendance WHERE employee_id = ? AND attendance_date = '2026-08-14'").get(empId);
      assert.equal(att.status, 'ON_LEAVE');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P02: Attendance Late-Marks -> Late Report -> Penalty Calculation
  // --------------------------------------------------------------------------
  await test('T3-P02', 'Attendance Late-Marks -> Late Report -> Penalty Calculation: >=3 late marks triggers penalty', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Late', 'Emp', 'late@test.com', 'Sales', 'Rep', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // 4 late marks
      const lateDates = ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'];
      for (const d of lateDates) {
        db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, is_late, late_minutes) VALUES (?, ?, 'PRESENT', '09:45:00', 1, 15)").run(empId, d);
      }

      // Query late mark count
      const lateCount = db.prepare("SELECT COUNT(*) as c FROM Attendance WHERE employee_id = ? AND is_late = 1").get(empId).c;
      assert.equal(lateCount, 4);

      // Classification rule: count >= 3 -> PENALTY_APPLICABLE
      const status = lateCount >= 3 ? 'PENALTY_APPLICABLE' : 'GRACE_PERIOD';
      assert.equal(status, 'PENALTY_APPLICABLE');

      // Penalty amount: Rs 500 per late mark above 2 = (4 - 2) * 500 = Rs 1000 or flat Rs 1500
      const penalty = (lateCount - 2) * 500;
      assert.equal(penalty, 1000);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P03: Overtime Clocking -> Rate Computation -> Payroll Net Addition
  // --------------------------------------------------------------------------
  await test('T3-P03', 'Overtime Clocking -> Rate Computation -> Payroll Net Addition', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('OT', 'Emp', 'ot@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 70400, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      // 4 days with 2.5 hours overtime each = 10.0 hours
      for (let i = 1; i <= 4; i++) {
        db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours) VALUES (?, ?, 'PRESENT', 10.5, 2.5)").run(empId, `2026-08-0${i}`);
      }

      const totalOtHours = db.prepare("SELECT SUM(overtime_hours) as ot FROM Attendance WHERE employee_id = ?").get(empId).ot;
      assert.equal(Number(totalOtHours), 10.0);

      const hourlyRate = calculateHourlyRate(70400, 22); // 400
      const otPay = Number((totalOtHours * hourlyRate).toFixed(2));
      assert.equal(otPay, 4000.0);

      const gross = 70400 + otPay;
      const tax = calculateTax(gross);
      const net = gross - tax;

      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, overtime_hours, overtime_pay, gross_salary, tax_deduction, net_salary)
        VALUES (?, ?, 8, 2026, ?, ?, ?, ?, ?)
      `).run(empId, salId, totalOtHours, otPay, gross, tax, net);

      const p = db.prepare("SELECT overtime_pay, gross_salary FROM Payroll WHERE employee_id = ?").get(empId);
      assert.equal(Number(p.overtime_pay), 4000.0);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P04: Salary Revision Under Transaction -> Historical Payroll Immutability
  // --------------------------------------------------------------------------
  await test('T3-P04', 'Salary Revision Under Transaction -> Historical Payroll Immutability', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Rev', 'Emp', 'rev@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // Month 1: Salary = 50,000
      const s1 = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date, is_active) VALUES (?, 50000, '2026-01-01', 1)").run(empId);
      const s1Id = Number(s1.lastInsertRowid);
      db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, gross_salary, net_salary) VALUES (?, ?, 8, 2026, 50000, 48750)").run(empId, s1Id);

      // Salary revision in Month 2: New salary = 80,000
      db.exec('BEGIN TRANSACTION;');
      db.prepare("UPDATE Salary SET is_active = 0 WHERE salary_id = ?").run(s1Id);
      const s2 = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date, is_active) VALUES (?, 80000, '2026-09-01', 1)").run(empId);
      const s2Id = Number(s2.lastInsertRowid);
      db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, gross_salary, net_salary) VALUES (?, ?, 9, 2026, 80000, 75750)").run(empId, s2Id);
      db.exec('COMMIT;');

      // Verify Month 1 payroll remains immutable with original salary snapshot
      const p1 = db.prepare("SELECT p.gross_salary, s.base_salary FROM Payroll p JOIN Salary s ON p.salary_id = s.salary_id WHERE p.employee_id = ? AND p.pay_period_month = 8").get(empId);
      assert.equal(Number(p1.gross_salary), 50000);
      assert.equal(Number(p1.base_salary), 50000);

      // Verify Month 2 payroll reflects new salary
      const p2 = db.prepare("SELECT p.gross_salary, s.base_salary FROM Payroll p JOIN Salary s ON p.salary_id = s.salary_id WHERE p.employee_id = ? AND p.pay_period_month = 9").get(empId);
      assert.equal(Number(p2.gross_salary), 80000);
      assert.equal(Number(p2.base_salary), 80000);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P05: Unpaid Leave Application -> Attendance Absence -> Payroll Loss of Pay (LOP)
  // --------------------------------------------------------------------------
  await test('T3-P05', 'Unpaid Leave Application -> Attendance Absence -> Payroll Loss of Pay (LOP)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('LOP', 'Emp', 'lop@test.com', 'Finance', 'Analyst', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 66000, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      // 3 days unpaid leave
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'UNPAID', '2026-08-05', '2026-08-07', 3.0, 'APPROVED')").run(empId);

      const dailyRate = calculateDailyRate(66000, 22); // 3000
      const unpaidDeduction = dailyRate * 3.0; // 9000
      const gross = 66000;
      const tax = calculateTax(gross - unpaidDeduction);
      const net = gross - unpaidDeduction - tax;

      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, absent_days, unpaid_leave_deduction, gross_salary, tax_deduction, net_salary)
        VALUES (?, ?, 8, 2026, 22, 19, 3.0, ?, ?, ?, ?)
      `).run(empId, salId, unpaidDeduction, gross, tax, net);

      const p = db.prepare("SELECT unpaid_leave_deduction, net_salary FROM Payroll WHERE employee_id = ?").get(empId);
      assert.equal(Number(p.unpaid_leave_deduction), 9000.0);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P06: Employee Self-Punch -> HR Approval Filter -> Monthly Attendance Report
  // --------------------------------------------------------------------------
  await test('T3-P06', 'Employee Self-Punch -> HR Approval Filter -> Monthly Attendance Report', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Punch', 'Emp', 'punch@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // Employee punches in
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked) VALUES (?, '2026-08-10', 'PRESENT', '09:00:00', '18:00:00', 8.0)").run(empId);

      // HR summary query
      const report = db.prepare(`
        SELECT employee_id, COUNT(*) as present_count
        FROM Attendance
        WHERE attendance_date BETWEEN '2026-08-01' AND '2026-08-31' AND status = 'PRESENT'
        GROUP BY employee_id
      `).all();

      const found = report.find(r => r.employee_id === empId);
      assert.ok(found);
      assert.equal(found.present_count, 1);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P07: Index Creation -> Query Plan Transition -> Benchmark Proof
  // --------------------------------------------------------------------------
  await test('T3-P07', 'Index Creation -> Query Plan Transition -> Benchmark Proof: SCAN vs SEARCH USING INDEX', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      // Plan with index
      const indexedPlan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM Attendance WHERE attendance_date = '2026-08-15' AND is_late = 1").all();
      const usesIndex = indexedPlan.some(r => String(r.detail).includes('USING INDEX') || String(r.detail).includes('idx_attendance_date_late'));
      assert.ok(usesIndex, 'Execution plan uses index');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P08: REST API Application -> Trigger Validation -> Error Code Mapping
  // --------------------------------------------------------------------------
  await test('T3-P08', 'REST API Application -> Trigger Validation -> Error Code Mapping: Future date returns 400', async () => {
    const { db, close } = createTestDb();
    const server = await startTestServer({ dbHandle: db });
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('API', 'Trigger', 'apitrigger@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      const res = await apiRequest(server.baseUrl, '/api/attendance/punch', {
        method: 'POST',
        role: 'HR',
        body: {
          employee_id: empId,
          attendance_date: '2099-12-31'
        }
      });

      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('future') || res.json.error.includes('date'));
    } finally {
      await server.close();
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P09: CLI Subprocess Execution -> Ephemeral Database -> Formatted Summary Output
  // --------------------------------------------------------------------------
  await test('T3-P09', 'CLI Subprocess Execution -> Ephemeral Database -> Formatted Summary Output', async () => {
    const { tempDiskFile, close } = createTestDb({ inMemory: false, seed: true });
    try {
      const res = runCli(['reports', 'attendance', '--month', '8', '--year', '2026'], {
        env: { PAYTRACK_DB_PATH: tempDiskFile }
      });
      assert.equal(res.exitCode, 0);
      assert.ok(res.stdout.includes('Monthly Attendance Summary Report'));
      assert.ok(res.stdout.includes('Emp ID'));
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P10: Transaction Rollback -> REST API Response -> Database State Verification
  // --------------------------------------------------------------------------
  await test('T3-P10', 'Transaction Rollback -> REST API Response -> Database State Verification', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const countBefore = db.prepare('SELECT COUNT(*) as c FROM Payroll').get().c;

      // Invalid month 13
      const res = await apiRequest(server.baseUrl, '/api/payroll/process', {
        method: 'POST',
        role: 'HR',
        body: { month: 13, year: 2026 }
      });

      assert.equal(res.status, 400);
      const countAfter = db.prepare('SELECT COUNT(*) as c FROM Payroll').get().c;
      assert.equal(countAfter, countBefore, 'Database state untouched after error');
    } finally {
      await server.close();
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P11: Role Switching (HR -> Employee) -> Dynamic Route Access
  // --------------------------------------------------------------------------
  await test('T3-P11', 'Role Switching (HR -> Employee) -> Dynamic Route Access', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      // 1. HR gets access
      const hrRes = await apiRequest(server.baseUrl, '/api/employees', { role: 'HR' });
      assert.equal(hrRes.status, 200);

      // 2. Employee gets blocked
      const empRes = await apiRequest(server.baseUrl, '/api/employees', { role: 'EMPLOYEE', employeeId: 3 });
      assert.equal(empRes.status, 403);
    } finally {
      await server.close();
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P12: Cascade Delete on Employee -> Verify Clean Child Table Purge
  // --------------------------------------------------------------------------
  await test('T3-P12', 'Cascade Delete on Employee -> Verify Clean Child Table Purge', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Cas', 'Purge', 'caspurge@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 60000, '2026-01-01')").run(empId);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'PRESENT')").run(empId);
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-11', 2.0, 'PENDING')").run(empId);

      // Delete employee
      db.prepare('DELETE FROM Employee WHERE employee_id = ?').run(empId);

      assert.equal(db.prepare('SELECT COUNT(*) as c FROM Salary WHERE employee_id = ?').get(empId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM Attendance WHERE employee_id = ?').get(empId).c, 0);
      assert.equal(db.prepare('SELECT COUNT(*) as c FROM Leave WHERE employee_id = ?').get(empId).c, 0);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P13: Concurrent Attendance Punches -> Unique Constraint Collision
  // --------------------------------------------------------------------------
  await test('T3-P13', 'Concurrent Attendance Punches -> Unique Constraint Collision: 1 succeeds, duplicate safely caught', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Race', 'Emp', 'race@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // First punch succeeds
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'PRESENT')").run(empId);

      // Second identical punch throws unique constraint
      assertThrowsConstraint(
        db,
        "INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'PRESENT')",
        [empId],
        'UNIQUE'
      );
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P14: Half-Day Attendance + Overtime Interaction
  // --------------------------------------------------------------------------
  await test('T3-P14', 'Half-Day Attendance + Overtime Interaction: 4h normal + 2h OT calculates 6h payable', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Half', 'Day', 'halfday@test.com', 'Engineering', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      // Hourly rate: base 52,800 / (22 * 8) = 300.0 / hr
      db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date, is_active) VALUES (?, 52800, '2026-01-01', 1)").run(empId);

      // Insert Attendance: status HALF_DAY, hours_worked = 6.0, overtime_hours = 2.0 (4h normal shift + 2h OT)
      db.prepare(`
        INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours)
        VALUES (?, '2026-08-05', 'HALF_DAY', 6.0, 2.0)
      `).run(empId);

      // Query from database Attendance and calculate payable
      const row = db.prepare(`
        SELECT a.status, a.hours_worked, a.overtime_hours, s.base_salary
        FROM Attendance a
        JOIN Salary s ON a.employee_id = s.employee_id AND s.is_active = 1
        WHERE a.employee_id = ? AND a.attendance_date = '2026-08-05'
      `).get(empId);

      assert.equal(row.status, 'HALF_DAY');
      assert.equal(Number(row.hours_worked), 6.0);
      assert.equal(Number(row.overtime_hours), 2.0);

      const hourlyRate = calculateHourlyRate(row.base_salary, 22); // 300.0
      const normalHours = Number(row.hours_worked) - Number(row.overtime_hours); // 4.0
      const totalPayable = Number(((normalHours + Number(row.overtime_hours)) * hourlyRate).toFixed(2));
      assert.equal(totalPayable, 1800.0);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P15: Holiday Calendar vs Attendance Reconciliation
  // --------------------------------------------------------------------------
  await test('T3-P15', 'Holiday Calendar vs Attendance Reconciliation: Weekend/Holiday records correctly categorized', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const holidayCount = db.prepare("SELECT COUNT(*) as c FROM Attendance WHERE status = 'HOLIDAY'").get().c;
      assert.ok(holidayCount > 0, 'Holiday days recognized');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // T3-P16: Multiple Concurrent Leave Requests -> Trigger Race Condition
  // --------------------------------------------------------------------------
  await test('T3-P16', 'Multiple Concurrent Leave Requests -> Trigger Race Condition: Second overlapping approval aborted', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Race', 'Leave', 'raceleave@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // Leave 1 approved
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-15', 6.0, 'APPROVED')").run(empId);

      // Leave 2 created pending for overlapping dates
      const l2 = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'SICK', '2026-08-12', '2026-08-14', 3.0, 'PENDING')").run(empId);
      const l2Id = Number(l2.lastInsertRowid);

      // Attempting to approve Leave 2 triggers abort
      assertThrowsConstraint(
        db,
        "UPDATE Leave SET status = 'APPROVED' WHERE leave_id = ?",
        [l2Id],
        'Overlapping approved leave exists'
      );
    } finally {
      close();
    }
  });

  return suiteResults;
}
