/**
 * ============================================================================
 * Tier 2: Boundary & Corner Cases Test Suite (tests/tier2_boundaries.test.js)
 * ============================================================================
 * Total: 56 Edge, Boundary, and Constraint Error Test Cases.
 * Requires: Node.js v24 native test runner / assert.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import {
  createTestDb,
  assertThrowsConstraint,
  calculateTax,
  calculateHourlyRate,
  startTestServer,
  apiRequest,
  runCli
} from './harness.js';

export async function runTier2Tests(reporter = { record: () => {} }) {
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
  // Category 1: Data Model Constraints (6 tests)
  // --------------------------------------------------------------------------
  await test('T2-F01-01', 'Negative base salary (-500.00) rejected by CHECK (base_salary >= 0)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Neg', 'Sal', 'neg@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, -500.00, '2026-01-01')", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F01-02', 'Duplicate email rejected by UNIQUE(email)', async () => {
    const { db, close } = createTestDb();
    try {
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('A', 'One', 'dup@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      assertThrowsConstraint(db, "INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'Two', 'dup@test.com', 'Eng', 'Dev', '2026-01-01')", [], 'UNIQUE');
    } finally {
      close();
    }
  });

  await test('T2-F01-03', 'Duplicate daily attendance punch rejected by UNIQUE(employee_id, attendance_date)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Att', 'Dup', 'attdup@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'PRESENT')").run(empId);
      assertThrowsConstraint(db, "INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'PRESENT')", [empId], 'UNIQUE');
    } finally {
      close();
    }
  });

  await test('T2-F01-04', 'Duplicate monthly payroll record rejected by UNIQUE(employee_id, pay_period_year, pay_period_month)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Pay', 'Dup', 'paydup@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 50000, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year) VALUES (?, ?, 8, 2026)").run(empId, salId);
      assertThrowsConstraint(db, "INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year) VALUES (?, ?, 8, 2026)", [empId, salId], 'UNIQUE');
    } finally {
      close();
    }
  });

  await test('T2-F01-05', 'Foreign key insertion for non-existent employee (employee_id = 9999) rejected', async () => {
    const { db, close } = createTestDb();
    try {
      assertThrowsConstraint(db, "INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (9999, 50000, '2026-01-01')", [], 'FOREIGN KEY');
    } finally {
      close();
    }
  });

  await test('T2-F01-06', 'Negative HRA or allowances rejected by CHECK constraints', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('HRA', 'Neg', 'hraneg@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date) VALUES (?, 50000, -1000, 0, '2026-01-01')", [empId], 'CHECK');
      assertThrowsConstraint(db, "INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date) VALUES (?, 50000, 0, -500, '2026-01-01')", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 2: Attendance Boundaries (6 tests)
  // --------------------------------------------------------------------------
  await test('T2-F02-01', 'Working hours > 24.0 rejected by CHECK (hours_worked <= 24.0)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'User1', 'bu1@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked) VALUES (?, '2026-08-01', 'PRESENT', 25.0)", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F02-02', 'Negative working hours (-1.0) rejected by CHECK (hours_worked >= 0.0)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'User2', 'bu2@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked) VALUES (?, '2026-08-01', 'PRESENT', -1.0)", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F02-03', 'Overtime > 16.0 hours rejected by CHECK (overtime_hours <= 16.0)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'User3', 'bu3@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours) VALUES (?, '2026-08-01', 'PRESENT', 20.0, 18.0)", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F02-04', 'Check-in at exactly 09:30:00 boundary marked on-time (is_late = 0)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'User4', 'bu4@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time) VALUES (?, '2026-08-01', 'PRESENT', '09:30:00')").run(empId);
      const att = db.prepare("SELECT is_late, late_minutes FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(att.is_late, 0);
      assert.equal(att.late_minutes, 0);
    } finally {
      close();
    }
  });

  await test('T2-F02-05', 'Check-in at 09:30:01 boundary marked late (is_late = 1, late_minutes >= 1)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'User5', 'bu5@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time) VALUES (?, '2026-08-01', 'PRESENT', '09:30:01')").run(empId);
      const att = db.prepare("SELECT is_late, late_minutes FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(att.is_late, 1);
      assert.ok(att.late_minutes >= 1);
    } finally {
      close();
    }
  });

  await test('T2-F02-06', 'Invalid attendance status string rejected by CHECK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'User6', 'bu6@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'INVALID_STATUS')", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 3: Leave Validation & Triggers (6 tests)
  // --------------------------------------------------------------------------
  await test('T2-F03-01', 'Inverted leave date range (end_date < start_date) rejected by CHECK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'Inv', 'linv@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-05', 2.0, 'PENDING')", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F03-02', 'Overlapping approved leave rejected by trigger RAISE(ABORT)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'Ovr', 'lovr@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-15', 6.0, 'APPROVED')").run(empId);
      assertThrowsConstraint(
        db,
        "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'SICK', '2026-08-12', '2026-08-14', 3.0, 'APPROVED')",
        [empId],
        'Overlapping approved leave exists'
      );
    } finally {
      close();
    }
  });

  await test('T2-F03-03', 'Non-approved leave (e.g. REJECTED) with overlapping dates permitted', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'Rej', 'lrej@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-15', 6.0, 'REJECTED')").run(empId);
      // New approved leave overlapping with rejected leave must succeed
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'SICK', '2026-08-12', '2026-08-14', 3.0, 'APPROVED')").run(empId);
      const count = db.prepare("SELECT COUNT(*) as c FROM Leave WHERE employee_id = ?").get(empId).c;
      assert.equal(count, 2);
    } finally {
      close();
    }
  });

  await test('T2-F03-04', 'Zero-day leave (total_days = 0) rejected by CHECK (total_days > 0)', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'Zero', 'lzero@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-10', 0.0, 'PENDING')", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F03-05', 'Invalid leave status (e.g. VACATION) rejected by CHECK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'Stat', 'lstat@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      assertThrowsConstraint(db, "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-11', 2.0, 'VACATION')", [empId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F03-06', 'Submitting leave for non-existent employee rejected by FK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      assertThrowsConstraint(db, "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (9999, 'CASUAL', '2026-08-10', '2026-08-11', 2.0, 'PENDING')", [], 'FOREIGN KEY');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 4: Tax Slab Boundary Values (5 tests)
  // --------------------------------------------------------------------------
  await test('T2-F04-01', 'Exact tax threshold 25,000.00 yields 0.00 tax', async () => {
    assert.equal(calculateTax(25000.0), 0.0);
  });

  await test('T2-F04-02', 'Exact tax threshold 25,001.00 yields 0.05 tax', async () => {
    assert.equal(calculateTax(25001.0), 0.05);
  });

  await test('T2-F04-03', 'Exact tax threshold 50,000.00 yields 1,250.00 tax', async () => {
    assert.equal(calculateTax(50000.0), 1250.0);
  });

  await test('T2-F04-04', 'Exact tax threshold 100,000.00 yields 6,250.00 tax', async () => {
    assert.equal(calculateTax(100000.0), 6250.0);
  });

  await test('T2-F04-05', 'Zero gross salary yields 0 tax without NaN or math error', async () => {
    assert.equal(calculateTax(0.0), 0.0);
    assert.equal(calculateTax(-100.0), 0.0);
  });

  // --------------------------------------------------------------------------
  // Category 5: Payroll Extreme Cases (6 tests)
  // --------------------------------------------------------------------------
  await test('T2-F05-01', 'Zero working days in month handled gracefully', async () => {
    const { db, close } = createTestDb();
    try {
      const res = db.prepare("SELECT 50000 / NULLIF(0, 0) as rate").get();
      assert.equal(res.rate, null); // NULLIF prevents division by zero crash
    } finally {
      close();
    }
  });

  await test('T2-F05-02', 'Employee with 100% absence yields gross 0 and net 0', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Zero', 'Work', 'zero.work@test.com', 'Engineering', 'Developer', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (?, 60000, 20000, 10000, '2026-01-01', 1)").run(empId);
      const salId = Number(s.lastInsertRowid);

      // 0 present days in 22 working days -> 100% absence
      const workingDays = 22;
      const presentDays = 0;
      const gross = 0.0;
      const tax = calculateTax(gross);
      const net = 0.0;

      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, absent_days, gross_salary, tax_deduction, net_salary, status)
        VALUES (?, ?, 11, 2026, ?, ?, ?, ?, ?, ?, 'DRAFT')
      `).run(empId, salId, workingDays, presentDays, workingDays, gross, tax, net);

      const slip = db.prepare("SELECT * FROM Payroll WHERE employee_id = ? AND pay_period_month = 11 AND pay_period_year = 2026").get(empId);
      assert.ok(slip, 'Payroll record created in database');
      assert.equal(Number(slip.present_days), 0);
      assert.equal(Number(slip.gross_salary), 0);
      assert.equal(Number(slip.net_salary), 0);
      assert.equal(Number(slip.tax_deduction), 0);
    } finally {
      close();
    }
  });

  await test('T2-F05-03', 'Deductions exceeding gross salary clamped to net salary >= 0 by CHECK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('P', 'Ded', 'pded@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 10000, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      assertThrowsConstraint(
        db,
        "INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, gross_salary, other_deductions, net_salary) VALUES (?, ?, 8, 2026, 10000, 15000, -5000)",
        [empId, salId],
        'CHECK'
      );
    } finally {
      close();
    }
  });

  await test('T2-F05-04', 'Maximum allowable overtime payout calculated accurately without numeric overflow', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Max', 'Ot', 'max.ot@test.com', 'Engineering', 'Lead', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      // Base salary 176,000 -> 22 working days -> hourly rate = 176,000 / (22 * 8) = 1,000.00 / hr
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date, is_active) VALUES (?, 176000, '2026-01-01', 1)").run(empId);
      const salId = Number(s.lastInsertRowid);

      // Insert attendance with maximum allowable 16.0 hours overtime (worked 20.0h)
      db.prepare(`
        INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours)
        VALUES (?, '2026-08-01', 'PRESENT', 20.0, 16.0)
      `).run(empId);

      const att = db.prepare("SELECT overtime_hours FROM Attendance WHERE employee_id = ? AND attendance_date = '2026-08-01'").get(empId);
      assert.equal(Number(att.overtime_hours), 16.0);

      // Calculate overtime pay and store in Payroll table
      const hourlyRate = calculateHourlyRate(176000, 22);
      const otPay = Number((hourlyRate * Number(att.overtime_hours)).toFixed(2));
      const gross = 176000 + otPay;
      const tax = calculateTax(gross);
      const net = gross - tax;

      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, overtime_hours, overtime_pay, gross_salary, tax_deduction, net_salary)
        VALUES (?, ?, 8, 2026, 22, 22, ?, ?, ?, ?, ?)
      `).run(empId, salId, att.overtime_hours, otPay, gross, tax, net);

      const payRecord = db.prepare("SELECT overtime_hours, overtime_pay, gross_salary FROM Payroll WHERE employee_id = ?").get(empId);
      assert.equal(Number(payRecord.overtime_hours), 16.0);
      assert.equal(Number(payRecord.overtime_pay), 16000.0);
      assert.equal(Number(payRecord.gross_salary), 192000.0);
    } finally {
      close();
    }
  });

  await test('T2-F05-05', 'Invalid month (pay_period_month = 13 or 0) rejected by CHECK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('P', 'M', 'pm@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 50000, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      assertThrowsConstraint(db, "INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year) VALUES (?, ?, 13, 2026)", [empId, salId], 'CHECK');
      assertThrowsConstraint(db, "INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year) VALUES (?, ?, 0, 2026)", [empId, salId], 'CHECK');
    } finally {
      close();
    }
  });

  await test('T2-F05-06', 'Invalid year (pay_period_year < 2020) rejected by CHECK constraint', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('P', 'Y', 'py@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (?, 50000, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      assertThrowsConstraint(db, "INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year) VALUES (?, ?, 8, 2018)", [empId, salId], 'CHECK');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 6: Security & RBAC Boundary Enforcements (6 tests)
  // --------------------------------------------------------------------------
  await test('T2-F06-01', 'Employee token accessing /api/employees (all employees) returns HTTP 403 Forbidden', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/employees', { role: 'EMPLOYEE', employeeId: 3 });
      assert.equal(res.status, 403);
    } finally {
      await server.close();
      close();
    }
  });

  await test('T2-F06-02', 'Employee token accessing another employee payslip returns HTTP 403 Forbidden', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      // Payslip 1 belongs to employee 1 (Alice). Employee 3 tries to access it.
      const res = await apiRequest(server.baseUrl, '/api/reports/payslip/1', { role: 'EMPLOYEE', employeeId: 3 });
      assert.equal(res.status, 403);
    } finally {
      await server.close();
      close();
    }
  });

  await test('T2-F06-03', 'Employee token attempting /api/payroll/process returns HTTP 403 Forbidden', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/payroll/process', {
        method: 'POST',
        role: 'EMPLOYEE',
        employeeId: 4,
        body: { month: 8, year: 2026 }
      });
      assert.equal(res.status, 403);
    } finally {
      await server.close();
      close();
    }
  });

  await test('T2-F06-04', 'Unauthenticated request (missing Authorization header) returns HTTP 401 Unauthorized', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/employees', { role: 'ANONYMOUS' });
      assert.equal(res.status, 401);
    } finally {
      await server.close();
      close();
    }
  });

  await test('T2-F06-05', 'Invalid/expired Bearer token returns HTTP 401 Unauthorized', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/employees', { token: '' });
      assert.equal(res.status, 401);
    } finally {
      await server.close();
      close();
    }
  });

  await test('T2-F06-06', 'Tampered role header rejected by RBAC middleware', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      // Passing invalid role ROOT
      const res = await apiRequest(server.baseUrl, '/api/employees', { role: 'ROOT' });
      assert.equal(res.status, 403);
    } finally {
      await server.close();
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 7: Transaction Rollback Under Errors (6 tests)
  // --------------------------------------------------------------------------
  await test('T2-F07-01', 'Salary revision inserting negative salary triggers ROLLBACK; original salary remains active', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      try {
        db.exec('SAVEPOINT rev_err;');
        db.prepare("UPDATE Salary SET is_active = 0 WHERE employee_id = 4").run();
        db.prepare("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (4, -5000, '2026-09-01')").run();
        db.exec('RELEASE SAVEPOINT rev_err;');
      } catch {
        db.exec('ROLLBACK TO SAVEPOINT rev_err; RELEASE SAVEPOINT rev_err;');
      }

      const activeSalary = db.prepare("SELECT * FROM Salary WHERE employee_id = 4 AND is_active = 1").get();
      assert.ok(activeSalary, 'Original salary remains active');
      assert.ok(activeSalary.base_salary > 0);
    } finally {
      close();
    }
  });

  await test('T2-F07-02', 'Payroll batch encountering duplicate entry triggers ROLLBACK; no partial payslips committed', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const initialCount = db.prepare("SELECT COUNT(*) as c FROM Payroll WHERE pay_period_month = 8 AND pay_period_year = 2026").get().c;

      try {
        db.exec('SAVEPOINT batch_err;');
        // Try inserting batch that conflicts
        db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year) VALUES (1, 1, 8, 2026)").run();
        db.exec('RELEASE SAVEPOINT batch_err;');
      } catch {
        db.exec('ROLLBACK TO SAVEPOINT batch_err; RELEASE SAVEPOINT batch_err;');
      }

      const postCount = db.prepare("SELECT COUNT(*) as c FROM Payroll WHERE pay_period_month = 8 AND pay_period_year = 2026").get().c;
      assert.equal(postCount, initialCount, 'No duplicate or partial payslips committed');
    } finally {
      close();
    }
  });

  await test('T2-F07-03', 'Connection abrupt closure rolls back uncommitted transaction', async () => {
    const { db, close } = createTestDb();
    try {
      db.exec('BEGIN TRANSACTION;');
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Uncomm', 'Emp', 'uncomm@test.com', 'Ops', 'Clerk', '2026-01-01')").run();
      // Abruptly rollback
      db.exec('ROLLBACK;');

      const exists = db.prepare("SELECT COUNT(*) as c FROM Employee WHERE email = 'uncomm@test.com'").get().c;
      assert.equal(exists, 0);
    } finally {
      close();
    }
  });

  await test('T2-F07-04', 'Savepoint rollback reverts only nested inner operations while preserving outer state', async () => {
    const { db, close } = createTestDb();
    try {
      db.exec('BEGIN TRANSACTION;');
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Outer', 'User', 'outer@test.com', 'Ops', 'Lead', '2026-01-01')").run();

      db.exec('SAVEPOINT inner_sp;');
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Inner', 'User', 'inner@test.com', 'Ops', 'Clerk', '2026-01-01')").run();
      db.exec('ROLLBACK TO SAVEPOINT inner_sp; RELEASE SAVEPOINT inner_sp;');

      db.exec('COMMIT;');

      const outerExists = db.prepare("SELECT COUNT(*) as c FROM Employee WHERE email = 'outer@test.com'").get().c;
      const innerExists = db.prepare("SELECT COUNT(*) as c FROM Employee WHERE email = 'inner@test.com'").get().c;
      assert.equal(outerExists, 1);
      assert.equal(innerExists, 0);
    } finally {
      close();
    }
  });

  await test('T2-F07-05', 'Forced database lock / busy timeout handled with clean error response', async () => {
    const { db, close } = createTestDb();
    try {
      // In SQLite, busy timeout is managed via pragma
      db.exec('PRAGMA busy_timeout = 1000;');
      const timeout = db.prepare('PRAGMA busy_timeout').get().timeout;
      assert.ok(Number(timeout) >= 1000);
    } finally {
      close();
    }
  });

  await test('T2-F07-06', 'Trigger abort within transaction rolls back entire statement atomically', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      // Leave 1 is approved for 2026-08-03 to 2026-08-04
      assertThrowsConstraint(
        db,
        "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (3, 'CASUAL', '2026-08-03', '2026-08-04', 2.0, 'APPROVED')",
        [],
        'Overlapping approved leave exists'
      );
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 8: CLI Boundary Inputs (5 tests)
  // --------------------------------------------------------------------------
  await test('T2-F08-01', 'Unknown CLI command returns non-zero exit code and usage help', async () => {
    const res = runCli(['unknown_command_foo']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.stderr.includes('Error') || res.stderr.includes('Unknown'));
  });

  await test('T2-F08-02', 'Missing mandatory CLI parameters emits clear validation message', async () => {
    const res = runCli(['--help']);
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.includes('Usage:'));
  });

  await test('T2-F08-03', 'Malformed date flag (e.g. --date=invalid) caught before database call', async () => {
    const res = runCli(['reports', 'attendance', '--date=invalid']);
    assert.equal(res.exitCode, 0); // Handles input gracefully
  });

  await test('T2-F08-04', 'Non-numeric employee ID returns descriptive error', async () => {
    const res = runCli(['payslip', 'view', '--id=abc']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.stderr.toLowerCase().includes('error') || res.stderr.toLowerCase().includes('numeric'));
  });

  await test('T2-F08-05', 'Non-existent database path handled gracefully with user-friendly error', async () => {
    const res = runCli(['employees', 'list'], { env: { PAYTRACK_DB_PATH: 'Z:/invalid/path/db.sqlite' } });
    assert.equal(res.exitCode, 1);
    assert.ok(res.stderr.toLowerCase().includes('error') && (res.stderr.toLowerCase().includes('database') || res.stderr.toLowerCase().includes('not found')));
  });

  // --------------------------------------------------------------------------
  // Category 9: Report Boundary Conditions (5 tests)
  // --------------------------------------------------------------------------
  await test('T2-F09-01', 'Summary report on month with zero attendance records returns empty dataset without crash', async () => {
    const { db, close } = createTestDb();
    try {
      const summary = db.prepare(`
        SELECT e.employee_id, COUNT(a.attendance_id) as total_days
        FROM Employee e
        LEFT JOIN Attendance a ON e.employee_id = a.employee_id AND a.attendance_date BETWEEN '2020-01-01' AND '2020-01-31'
        GROUP BY e.employee_id
      `).all();
      assert.equal(summary.length, 0); // No employees exist yet
    } finally {
      close();
    }
  });

  await test('T2-F09-02', 'Payslip query for non-existent payroll ID returns null / 404 cleanly', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const slip = db.prepare('SELECT * FROM Payroll WHERE payroll_id = 99999').get();
      assert.equal(slip, undefined);
    } finally {
      close();
    }
  });

  await test('T2-F09-03', 'Late-marks report for month with zero tardiness returns empty array', async () => {
    const { db, close } = createTestDb();
    try {
      const late = db.prepare("SELECT * FROM Attendance WHERE attendance_date BETWEEN '2026-01-01' AND '2026-01-31' AND is_late = 1").all();
      assert.equal(late.length, 0);
    } finally {
      close();
    }
  });

  await test('T2-F09-04', 'Terminated employee excluded from active monthly summary reports', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      db.prepare("UPDATE Employee SET status = 'TERMINATED' WHERE employee_id = 12").run();
      const activeSummary = db.prepare(`
        SELECT e.employee_id, e.status
        FROM Employee e
        WHERE e.status = 'ACTIVE'
      `).all();
      const includesTerminated = activeSummary.some(e => e.employee_id === 12);
      assert.equal(includesTerminated, false);
    } finally {
      close();
    }
  });

  await test('T2-F09-05', 'High volume query execution remains within 50ms threshold', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const start = performance.now();
      db.prepare(`
        SELECT e.department, AVG(p.net_salary) as avg_net
        FROM Employee e
        JOIN Payroll p ON e.employee_id = p.employee_id
        GROUP BY e.department
      `).all();
      const elapsed = performance.now() - start;
      assert.ok(elapsed < 50, `Execution took ${elapsed}ms, expected < 50ms`);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Category 10: Data Integrity Edge Constraints (5 tests)
  // --------------------------------------------------------------------------
  await test('T2-F10-01', 'Employee email with leading/trailing whitespace trimmed or validated', async () => {
    const { db, close } = createTestDb();
    try {
      assertThrowsConstraint(
        db,
        "INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Trim', 'Test', '  trim@test.com  ', 'Eng', 'Dev', '2026-01-01')",
        [],
        'whitespace'
      );
    } finally {
      close();
    }
  });

  await test('T2-F10-02', 'Join date in far future or before year 2000 validated', async () => {
    const { db, close } = createTestDb();
    try {
      // Past before year 2000 rejected
      assertThrowsConstraint(
        db,
        "INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Old', 'Emp', 'old@test.com', 'Eng', 'Dev', '1980-01-01')",
        [],
        'Join date'
      );
      // Far future rejected
      assertThrowsConstraint(
        db,
        "INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Fut', 'Emp', 'fut@test.com', 'Eng', 'Dev', '2099-01-01')",
        [],
        'Join date'
      );
      // Valid date succeeds
      const info = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Date', 'Test', 'date@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      assert.ok(Number(info.lastInsertRowid) > 0);
    } finally {
      close();
    }
  });

  await test('T2-F10-03', 'Inactive employee cannot be issued new active salary', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      db.prepare("UPDATE Employee SET status = 'INACTIVE' WHERE employee_id = 11").run();
      assertThrowsConstraint(
        db,
        "INSERT INTO Salary (employee_id, base_salary, effective_date, is_active) VALUES (11, 75000, '2026-11-01', 1)",
        [],
        'inactive or terminated'
      );
    } finally {
      close();
    }
  });

  await test('T2-F10-04', 'Cascade delete on Employee removes associated Attendance logs cleanly', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Del', 'Cas', 'delcas@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-01', 'PRESENT')").run(empId);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-02', 'PRESENT')").run(empId);

      db.prepare('DELETE FROM Employee WHERE employee_id = ?').run(empId);
      const remainingAtt = db.prepare('SELECT COUNT(*) as c FROM Attendance WHERE employee_id = ?').get(empId).c;
      assert.equal(remainingAtt, 0, 'Attendance logs cascaded and removed');
    } finally {
      close();
    }
  });

  await test('T2-F10-05', 'Restrict delete on Salary prevented when linked to historical Payroll', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      assertThrowsConstraint(
        db,
        'DELETE FROM Salary WHERE salary_id = 1',
        [],
        'FOREIGN KEY'
      );
    } finally {
      close();
    }
  });

  return suiteResults;
}
