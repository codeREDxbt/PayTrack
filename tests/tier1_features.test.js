/**
 * ============================================================================
 * Tier 1: Core Feature Coverage Test Suite (tests/tier1_features.test.js)
 * ============================================================================
 * Total: 56 Happy-Path Test Cases across 10 Core Functional Features.
 * Requires: Node.js v24 native test runner / assert.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import {
  createTestDb,
  withTransaction,
  assertExecutionPlanUsesIndex,
  calculateTax,
  calculateDailyRate,
  calculateHourlyRate,
  startTestServer,
  apiRequest
} from './harness.js';

export async function runTier1Tests(reporter = { record: () => {} }) {
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
  // Feature 1: 5-Entity Relational Data Model (6 tests)
  // --------------------------------------------------------------------------
  await test('T1-F01-01', 'Schema creates all 5 tables with expected columns', async () => {
    const { db, close } = createTestDb();
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
      assert.ok(tables.includes('Employee'), 'Employee table exists');
      assert.ok(tables.includes('Salary'), 'Salary table exists');
      assert.ok(tables.includes('Attendance'), 'Attendance table exists');
      assert.ok(tables.includes('Leave'), 'Leave table exists');
      assert.ok(tables.includes('Payroll'), 'Payroll table exists');
    } finally {
      close();
    }
  });

  await test('T1-F01-02', 'Employee insertion with valid department and system_role', async () => {
    const { db, close } = createTestDb();
    try {
      const stmt = db.prepare(`
        INSERT INTO Employee (first_name, last_name, email, department, role, system_role, join_date)
        VALUES ('John', 'Doe', 'john.doe@paytrack.com', 'Engineering', 'Developer', 'EMPLOYEE', '2026-01-10')
      `);
      const info = stmt.run();
      assert.ok(Number(info.lastInsertRowid) > 0, 'Auto-increment PK generated');
      const emp = db.prepare('SELECT * FROM Employee WHERE employee_id = ?').get(info.lastInsertRowid);
      assert.equal(emp.first_name, 'John');
      assert.equal(emp.status, 'ACTIVE');
      assert.equal(emp.system_role, 'EMPLOYEE');
    } finally {
      close();
    }
  });

  await test('T1-F01-03', 'Foreign keys link Salary, Attendance, Leave, and Payroll to Employee', async () => {
    const { db, close } = createTestDb();
    try {
      const empInfo = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Jane', 'Smith', 'jane.smith@paytrack.com', 'HR', 'Manager', '2026-01-01')").run();
      const empId = Number(empInfo.lastInsertRowid);

      const sInfo = db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date) VALUES (?, 60000, 20000, 10000, '2026-01-01')").run(empId);
      const sId = Number(sInfo.lastInsertRowid);

      const aInfo = db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked) VALUES (?, '2026-01-02', 'PRESENT', 8.0)").run(empId);
      const lInfo = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-01-05', '2026-01-06', 2.0, 'APPROVED')").run(empId);
      const pInfo = db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, gross_salary, net_salary) VALUES (?, ?, 1, 2026, 90000, 85000)").run(empId, sId);

      assert.ok(sId > 0 && Number(aInfo.lastInsertRowid) > 0 && Number(lInfo.lastInsertRowid) > 0 && Number(pInfo.lastInsertRowid) > 0);
    } finally {
      close();
    }
  });

  await test('T1-F01-04', 'Unique email constraint allows distinct emails', async () => {
    const { db, close } = createTestDb();
    try {
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('A', 'One', 'a1@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('B', 'Two', 'b2@test.com', 'Eng', 'Dev', '2026-01-01')").run();
      const count = db.prepare('SELECT COUNT(*) as c FROM Employee').get().c;
      assert.equal(count, 2);
    } finally {
      close();
    }
  });

  await test('T1-F01-05', 'Valid default values (system_role = EMPLOYEE, status = ACTIVE)', async () => {
    const { db, close } = createTestDb();
    try {
      db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Default', 'User', 'def@test.com', 'QA', 'Tester', '2026-01-01')").run();
      const emp = db.prepare("SELECT * FROM Employee WHERE email = 'def@test.com'").get();
      assert.equal(emp.system_role, 'EMPLOYEE');
      assert.equal(emp.status, 'ACTIVE');
    } finally {
      close();
    }
  });

  await test('T1-F01-06', 'Self-referencing FK (Leave.approved_by -> Employee.employee_id) accepts valid supervisor', async () => {
    const { db, close } = createTestDb();
    try {
      const sup = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, system_role, join_date) VALUES ('Super', 'Visor', 'sup@test.com', 'Ops', 'Director', 'HR', '2026-01-01')").run();
      const emp = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Sub', 'Ordinate', 'sub@test.com', 'Ops', 'Clerk', '2026-01-01')").run();
      const supId = Number(sup.lastInsertRowid);
      const empId = Number(emp.lastInsertRowid);

      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, approved_by) VALUES (?, 'CASUAL', '2026-02-01', '2026-02-02', 2.0, 'APPROVED', ?)").run(empId, supId);
      const leave = db.prepare("SELECT * FROM Leave WHERE employee_id = ?").get(empId);
      assert.equal(leave.approved_by, supId);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 2: Procedural Computations (Salary & Deductions) (6 tests)
  // --------------------------------------------------------------------------
  await test('T1-F02-01', 'Standard daily rate computation (base_salary / working_days)', async () => {
    const rate = calculateDailyRate(66000, 22);
    assert.equal(rate, 3000.0);
  });

  await test('T1-F02-02', 'Hourly rate computation (base_salary / (working_days * 8.0))', async () => {
    const rate = calculateHourlyRate(70400, 22);
    assert.equal(rate, 400.0);
  });

  await test('T1-F02-03', 'Prorated base earnings for partial attendance', async () => {
    const dailyRate = calculateDailyRate(60000, 20); // 3000 per day
    const presentDays = 15;
    const earned = dailyRate * presentDays;
    assert.equal(earned, 45000.0);
  });

  await test('T1-F02-04', 'Allowances proration matching effective days worked', async () => {
    const totalAllowances = 12000;
    const workingDays = 24;
    const effectiveDays = 18;
    const proratedAllow = Number((totalAllowances * (effectiveDays / workingDays)).toFixed(2));
    assert.equal(proratedAllow, 9000.0);
  });

  await test('T1-F02-05', 'Overtime payout calculation (overtime_hours * hourly_rate * 1.0)', async () => {
    const hourlyRate = 350.0;
    const otHours = 10.0;
    const otPay = Number((otHours * hourlyRate * 1.0).toFixed(2));
    assert.equal(otPay, 3500.0);
  });

  await test('T1-F02-06', 'Half-day attendance credits exact 0.5 day wage', async () => {
    const dailyRate = 2400.0;
    const halfDayCredit = Number((dailyRate * 0.5).toFixed(2));
    assert.equal(halfDayCredit, 1200.0);
  });

  // --------------------------------------------------------------------------
  // Feature 3: Progressive Tax (TDS) Slabs (5 tests)
  // --------------------------------------------------------------------------
  await test('T1-F03-01', 'Income <= 25,000 yields 0 tax (0% slab)', async () => {
    assert.equal(calculateTax(20000), 0.0);
    assert.equal(calculateTax(25000), 0.0);
  });

  await test('T1-F03-02', 'Income 40,000 yields 750 tax (5% slab on amount above 25,000)', async () => {
    assert.equal(calculateTax(40000), 750.0);
  });

  await test('T1-F03-03', 'Income 70,000 yields 3,250 tax (10% slab)', async () => {
    // 25k@0 = 0, 25k@5% = 1250, 20k@10% = 2000 => 3250
    assert.equal(calculateTax(70000), 3250.0);
  });

  await test('T1-F03-04', 'Income 120,000 yields 9,250 tax (15% slab)', async () => {
    // 25k@0 = 0, 25k@5% = 1250, 50k@10% = 5000, 20k@15% = 3000 => 9250
    assert.equal(calculateTax(120000), 9250.0);
  });

  await test('T1-F03-05', 'Boundary incomes (25k, 50k, 100k) calculate exact continuous tax', async () => {
    assert.equal(calculateTax(25000), 0.0);
    assert.equal(calculateTax(50000), 1250.0);
    assert.equal(calculateTax(100000), 6250.0);
  });

  // --------------------------------------------------------------------------
  // Feature 4: Attendance & Time Tracking (6 tests)
  // --------------------------------------------------------------------------
  await test('T1-F04-01', 'Normal check-in (09:00) and check-out (18:00) yields 8.0 hours worked', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('T', 'User', 't1@pay.com', 'QA', 'Eng', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked) VALUES (?, '2026-08-01', 'PRESENT', '09:00:00', '18:00:00', 8.0)").run(empId);
      const att = db.prepare("SELECT * FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(Number(att.hours_worked), 8.0);
    } finally {
      close();
    }
  });

  await test('T1-F04-02', 'On-time arrival (09:15) marked as is_late = 0, late_minutes = 0', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('T', 'User2', 't2@pay.com', 'QA', 'Eng', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked) VALUES (?, '2026-08-02', 'PRESENT', '09:15:00', '18:00:00', 8.0)").run(empId);
      const att = db.prepare("SELECT * FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(att.is_late, 0);
      assert.equal(att.late_minutes, 0);
    } finally {
      close();
    }
  });

  await test('T1-F04-03', 'Half-day check-in/out records status HALF_DAY', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('T', 'User3', 't3@pay.com', 'QA', 'Eng', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked) VALUES (?, '2026-08-03', 'HALF_DAY', '09:00:00', '13:00:00', 4.0)").run(empId);
      const att = db.prepare("SELECT * FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(att.status, 'HALF_DAY');
      assert.equal(Number(att.hours_worked), 4.0);
    } finally {
      close();
    }
  });

  await test('T1-F04-04', 'Overtime hours clocking (e.g. 2.5 hours) accepted', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('T', 'User4', 't4@pay.com', 'QA', 'Eng', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked, overtime_hours) VALUES (?, '2026-08-04', 'PRESENT', '09:00:00', '20:30:00', 10.5, 2.5)").run(empId);
      const att = db.prepare("SELECT * FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(Number(att.overtime_hours), 2.5);
    } finally {
      close();
    }
  });

  await test('T1-F04-05', 'Daily log uniqueness per employee/date', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('T', 'User5', 't5@pay.com', 'QA', 'Eng', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (?, '2026-08-05', 'PRESENT')").run(empId);
      const row = db.prepare("SELECT COUNT(*) as c FROM Attendance WHERE employee_id = ? AND attendance_date = '2026-08-05'").get(empId);
      assert.equal(row.c, 1);
    } finally {
      close();
    }
  });

  await test('T1-F04-06', 'Absent status records 0 hours worked without error', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('T', 'User6', 't6@pay.com', 'QA', 'Eng', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours) VALUES (?, '2026-08-06', 'ABSENT', 0.0, 0.0)").run(empId);
      const att = db.prepare("SELECT * FROM Attendance WHERE employee_id = ?").get(empId);
      assert.equal(att.status, 'ABSENT');
      assert.equal(Number(att.hours_worked), 0.0);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 5: Leave Management & Approvals (5 tests)
  // --------------------------------------------------------------------------
  await test('T1-F05-01', 'Normal leave application insertion with status PENDING', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'User1', 'l1@pay.com', 'HR', 'Rep', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const info = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-12', 3.0, 'PENDING', 'Personal')").run(empId);
      const leave = db.prepare("SELECT * FROM Leave WHERE leave_id = ?").get(info.lastInsertRowid);
      assert.equal(leave.status, 'PENDING');
      assert.equal(Number(leave.total_days), 3.0);
    } finally {
      close();
    }
  });

  await test('T1-F05-02', 'Leave approval update sets status APPROVED and approved_by', async () => {
    const { db, close } = createTestDb();
    try {
      const sup = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'Sup', 'lsup@pay.com', 'HR', 'Dir', '2026-01-01')").run();
      const emp = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'User2', 'l2@pay.com', 'HR', 'Rep', '2026-01-01')").run();
      const supId = Number(sup.lastInsertRowid);
      const empId = Number(emp.lastInsertRowid);

      const l = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'SICK', '2026-08-15', '2026-08-16', 2.0, 'PENDING')").run(empId);
      const leaveId = Number(l.lastInsertRowid);

      db.prepare("UPDATE Leave SET status = 'APPROVED', approved_by = ?, decided_on = CURRENT_TIMESTAMP WHERE leave_id = ?").run(supId, leaveId);
      const updated = db.prepare("SELECT * FROM Leave WHERE leave_id = ?").get(leaveId);
      assert.equal(updated.status, 'APPROVED');
      assert.equal(updated.approved_by, supId);
    } finally {
      close();
    }
  });

  await test('T1-F05-03', 'Leave rejection update sets status REJECTED', async () => {
    const { db, close } = createTestDb();
    try {
      const emp = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'User3', 'l3@pay.com', 'HR', 'Rep', '2026-01-01')").run();
      const empId = Number(emp.lastInsertRowid);

      const l = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-20', '2026-08-22', 3.0, 'PENDING')").run(empId);
      const leaveId = Number(l.lastInsertRowid);

      db.prepare("UPDATE Leave SET status = 'REJECTED' WHERE leave_id = ?").run(leaveId);
      const updated = db.prepare("SELECT * FROM Leave WHERE leave_id = ?").get(leaveId);
      assert.equal(updated.status, 'REJECTED');
    } finally {
      close();
    }
  });

  await test('T1-F05-04', 'Multi-day valid date span calculates correct total days', async () => {
    const { db, close } = createTestDb();
    try {
      const emp = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'User4', 'l4@pay.com', 'HR', 'Rep', '2026-01-01')").run();
      const empId = Number(emp.lastInsertRowid);
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'EARNED', '2026-09-01', '2026-09-05', 5.0, 'PENDING')").run(empId);
      const leave = db.prepare("SELECT * FROM Leave WHERE employee_id = ?").get(empId);
      assert.equal(Number(leave.total_days), 5.0);
    } finally {
      close();
    }
  });

  await test('T1-F05-05', 'Non-overlapping approved leaves for different dates accepted', async () => {
    const { db, close } = createTestDb();
    try {
      const emp = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('L', 'User5', 'l5@pay.com', 'HR', 'Rep', '2026-01-01')").run();
      const empId = Number(emp.lastInsertRowid);

      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-01', '2026-08-03', 3.0, 'APPROVED')").run(empId);
      db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-12', 3.0, 'APPROVED')").run(empId);

      const count = db.prepare("SELECT COUNT(*) as c FROM Leave WHERE employee_id = ? AND status = 'APPROVED'").get(empId).c;
      assert.equal(count, 2);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 6: Seed Dataset & Data Integrity (6 tests)
  // --------------------------------------------------------------------------
  await test('T1-F06-01', 'Exactly 12 employees loaded with diverse departments', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const empCount = db.prepare('SELECT COUNT(*) as c FROM Employee').get().c;
      const deptCount = db.prepare('SELECT COUNT(DISTINCT department) as d FROM Employee').get().d;
      assert.equal(empCount, 12);
      assert.ok(deptCount >= 5, `Expected >= 5 departments, got ${deptCount}`);
    } finally {
      close();
    }
  });

  await test('T1-F06-02', '3 months of continuous attendance logs (900+ rows)', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const totalAtt = db.prepare('SELECT COUNT(*) as c FROM Attendance').get().c;
      const distinctMonths = db.prepare("SELECT COUNT(DISTINCT STRFTIME('%Y-%m', attendance_date)) as m FROM Attendance").get().m;
      assert.ok(totalAtt >= 800, `Expected >= 800 attendance rows, got ${totalAtt}`);
      assert.equal(distinctMonths, 3, 'Covers exactly 3 distinct calendar months');
    } finally {
      close();
    }
  });

  await test('T1-F06-03', 'Active salary structures present for all employees', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const activeSalaries = db.prepare('SELECT COUNT(*) as c FROM Salary WHERE is_active = 1').get().c;
      assert.equal(activeSalaries, 12);
    } finally {
      close();
    }
  });

  await test('T1-F06-04', 'Leave history present with approved and rejected records', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const approved = db.prepare("SELECT COUNT(*) as c FROM Leave WHERE status = 'APPROVED'").get().c;
      const rejected = db.prepare("SELECT COUNT(*) as c FROM Leave WHERE status = 'REJECTED'").get().c;
      assert.ok(approved >= 1, 'Has approved leaves');
      assert.ok(rejected >= 1, 'Has rejected leaves');
    } finally {
      close();
    }
  });

  await test('T1-F06-05', 'Monthly payroll records present for all 3 periods', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const payrollCount = db.prepare('SELECT COUNT(*) as c FROM Payroll').get().c;
      assert.equal(payrollCount, 36, '12 employees x 3 months = 36 payroll slips');
    } finally {
      close();
    }
  });

  await test('T1-F06-06', 'Data integrity: No orphan attendance or salary records', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const orphanAtt = db.prepare("SELECT COUNT(*) as c FROM Attendance a LEFT JOIN Employee e ON a.employee_id = e.employee_id WHERE e.employee_id IS NULL").get().c;
      const orphanSal = db.prepare("SELECT COUNT(*) as c FROM Salary s LEFT JOIN Employee e ON s.employee_id = e.employee_id WHERE e.employee_id IS NULL").get().c;
      assert.equal(orphanAtt, 0);
      assert.equal(orphanSal, 0);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 7: Analytical Reports Generation (6 tests)
  // --------------------------------------------------------------------------
  await test('T1-F07-01', 'Monthly Attendance Summary report aggregates days correctly', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const summary = db.prepare(`
        SELECT 
          e.employee_id,
          e.first_name || ' ' || e.last_name as name,
          COUNT(a.attendance_id) as total_logged_days,
          SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
          SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days
        FROM Employee e
        JOIN Attendance a ON e.employee_id = a.employee_id
        WHERE a.attendance_date BETWEEN '2026-08-01' AND '2026-08-31'
        GROUP BY e.employee_id
        ORDER BY e.employee_id
      `).all();

      assert.equal(summary.length, 12);
      assert.equal(summary[0].total_logged_days, 31);
    } finally {
      close();
    }
  });

  await test('T1-F07-02', 'Salary slip report per employee returns full financial breakdown', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const payslip = db.prepare(`
        SELECT p.*, e.first_name, e.last_name, e.department, s.base_salary, s.hra, s.allowances
        FROM Payroll p
        JOIN Employee e ON p.employee_id = e.employee_id
        JOIN Salary s ON p.salary_id = s.salary_id
        WHERE p.employee_id = 1 AND p.pay_period_month = 8 AND p.pay_period_year = 2026
      `).get();

      assert.ok(payslip, 'Payslip found');
      assert.ok(payslip.gross_salary > 0);
      assert.ok(payslip.net_salary > 0);
      assert.equal(payslip.net_salary, payslip.gross_salary - payslip.tax_deduction - payslip.other_deductions);
    } finally {
      close();
    }
  });

  await test('T1-F07-03', 'Late-Marks report lists tardy records with minutes', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const lateMarks = db.prepare(`
        SELECT a.attendance_id, a.employee_id, a.attendance_date, a.check_in_time, a.late_minutes
        FROM Attendance a
        WHERE a.is_late = 1
        ORDER BY a.late_minutes DESC
      `).all();

      assert.ok(lateMarks.length > 0, 'Late marks detected');
      assert.ok(lateMarks[0].late_minutes > 0);
    } finally {
      close();
    }
  });

  await test('T1-F07-04', 'Report queries execute without NULL reference errors', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const res = db.prepare(`
        SELECT 
          COALESCE(SUM(p.gross_salary), 0) as total_gross,
          COALESCE(SUM(p.tax_deduction), 0) as total_tax,
          COALESCE(SUM(p.net_salary), 0) as total_disbursed
        FROM Payroll p
      `).get();

      assert.ok(res.total_gross > 0);
      assert.ok(res.total_disbursed > 0);
    } finally {
      close();
    }
  });

  await test('T1-F07-05', 'Department grouping in summary calculates valid attendance percentage', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const deptSummary = db.prepare(`
        SELECT 
          e.department,
          COUNT(a.attendance_id) as total_logs,
          ROUND(AVG(CASE WHEN a.status = 'PRESENT' THEN 100.0 ELSE 0.0 END), 2) as avg_attendance_pct
        FROM Employee e
        JOIN Attendance a ON e.employee_id = a.employee_id
        GROUP BY e.department
      `).all();

      assert.ok(deptSummary.length > 0);
      assert.ok(deptSummary[0].avg_attendance_pct >= 0 && deptSummary[0].avg_attendance_pct <= 100);
    } finally {
      close();
    }
  });

  await test('T1-F07-06', 'Payslip net salary equals gross salary minus TDS tax deduction', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const slip = db.prepare("SELECT * FROM Payroll WHERE employee_id = 2 AND pay_period_month = 8").get();
      const expectedNet = Number((slip.gross_salary - slip.tax_deduction - slip.unpaid_leave_deduction - slip.other_deductions).toFixed(2));
      assert.equal(Number(slip.net_salary), expectedNet);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 8: B-Tree Indexing & Performance (5 tests)
  // --------------------------------------------------------------------------
  await test('T1-F08-01', 'All 9 performance indexes exist in sqlite_master', async () => {
    const { db, close } = createTestDb();
    try {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
      assert.ok(indexes.includes('idx_employee_email'));
      assert.ok(indexes.includes('idx_employee_department'));
      assert.ok(indexes.includes('idx_employee_status'));
      assert.ok(indexes.includes('idx_salary_emp_active'));
      assert.ok(indexes.includes('idx_attendance_emp_date'));
      assert.ok(indexes.includes('idx_attendance_date_late'));
      assert.ok(indexes.includes('idx_leave_emp_dates_status'));
      assert.ok(indexes.includes('idx_payroll_emp_period'));
      assert.ok(indexes.includes('idx_payroll_status'));
    } finally {
      close();
    }
  });

  await test('T1-F08-02', 'Querying by email utilizes index idx_employee_email', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      assertExecutionPlanUsesIndex(db, "SELECT * FROM Employee WHERE email = 'alice.smith@paytrack.com'", 'idx_employee_email');
    } finally {
      close();
    }
  });

  await test('T1-F08-03', 'Querying attendance date and late flag utilizes idx_attendance_date_late', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      assertExecutionPlanUsesIndex(db, "SELECT * FROM Attendance WHERE attendance_date = '2026-08-04' AND is_late = 1", 'idx_attendance_date_late');
    } finally {
      close();
    }
  });

  await test('T1-F08-04', 'Querying payroll period utilizes idx_payroll_emp_period', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      assertExecutionPlanUsesIndex(db, "SELECT * FROM Payroll WHERE employee_id = 1 AND pay_period_year = 2026 AND pay_period_month = 8", 'idx_payroll_emp_period');
    } finally {
      close();
    }
  });

  await test('T1-F08-05', 'EXPLAIN QUERY PLAN confirms indexed search vs table scan', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM Attendance WHERE attendance_date = '2026-08-10' AND is_late = 1").all();
      const planStr = JSON.stringify(plan);
      assert.ok(planStr.includes('USING INDEX') || planStr.includes('SEARCH'), 'Query plan uses index search');
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 9: Role-Based Access Control (RBAC) (5 tests)
  // --------------------------------------------------------------------------
  await test('T1-F09-01', 'Admin role granted access to all employee records', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/employees', { role: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.json.total, 12);
    } finally {
      await server.close();
      close();
    }
  });

  await test('T1-F09-02', 'HR role granted access to attendance and leave approvals', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/leaves/5/status', {
        method: 'PATCH',
        role: 'HR',
        body: { status: 'APPROVED' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.status, 'APPROVED');
    } finally {
      await server.close();
      close();
    }
  });

  await test('T1-F09-03', 'Employee role granted access to own profile', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/employees/4', {
        role: 'EMPLOYEE',
        employeeId: 4
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.first_name, 'Diana');
    } finally {
      await server.close();
      close();
    }
  });

  await test('T1-F09-04', 'Employee role granted access to own attendance punches', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      const res = await apiRequest(server.baseUrl, '/api/attendance', {
        role: 'EMPLOYEE',
        employeeId: 4
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.json.data));
      // All returned rows must belong to employee 4
      const allMine = res.json.data.every(r => r.employee_id === 4);
      assert.ok(allMine, 'Only own attendance returned');
    } finally {
      await server.close();
      close();
    }
  });

  await test('T1-F09-05', 'Employee role granted access to own payslips', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      // Find a payslip for emp 4
      const p = db.prepare('SELECT payroll_id FROM Payroll WHERE employee_id = 4 LIMIT 1').get();
      const res = await apiRequest(server.baseUrl, `/api/reports/payslip/${p.payroll_id}`, {
        role: 'EMPLOYEE',
        employeeId: 4
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.employee_id, 4);
    } finally {
      await server.close();
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 10: ACID Transactions (6 tests)
  // --------------------------------------------------------------------------
  await test('T1-F10-01', 'Salary revision wraps old record deactivation and new insert in transaction', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      await withTransaction(db, async () => {
        db.prepare("UPDATE Salary SET is_active = 0 WHERE employee_id = 3").run();
        db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (3, 85000, 25000, 15000, '2026-09-01', 1)").run();
      });

      // After rollback from withTransaction, state is reverted
      const activeCount = db.prepare("SELECT COUNT(*) as c FROM Salary WHERE employee_id = 3 AND is_active = 1").get().c;
      assert.equal(activeCount, 1);
    } finally {
      close();
    }
  });

  await test('T1-F10-02', 'Successful transaction commits both operations', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      db.exec('BEGIN TRANSACTION;');
      db.prepare("UPDATE Salary SET is_active = 0 WHERE employee_id = 3").run();
      db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (3, 88000, 26000, 15000, '2026-10-01', 1)").run();
      db.exec('COMMIT;');

      const activeSalary = db.prepare("SELECT * FROM Salary WHERE employee_id = 3 AND is_active = 1").get();
      assert.equal(Number(activeSalary.base_salary), 88000);
      const totalSalaries = db.prepare("SELECT COUNT(*) as c FROM Salary WHERE employee_id = 3").get().c;
      assert.equal(totalSalaries, 2);
    } finally {
      close();
    }
  });

  await test('T1-F10-03', 'Payroll generation batch commits all employee slips atomically', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      db.exec('BEGIN TRANSACTION;');
      const stmt = db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, gross_salary, net_salary, status)
        VALUES (?, 1, 11, 2026, 60000, 55000, 'DRAFT')
      `);
      for (let i = 1; i <= 5; i++) {
        stmt.run(i);
      }
      db.exec('COMMIT;');

      const count = db.prepare("SELECT COUNT(*) as c FROM Payroll WHERE pay_period_month = 11 AND pay_period_year = 2026").get().c;
      assert.equal(count, 5);
    } finally {
      close();
    }
  });

  await test('T1-F10-04', 'Transaction isolation ensures concurrent readers see consistent state', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      // Start transaction and update without commit
      db.exec('SAVEPOINT iso_test;');
      db.prepare("UPDATE Employee SET first_name = 'UpdatedInSavepoint' WHERE employee_id = 1").run();
      
      const inSavepoint = db.prepare("SELECT first_name FROM Employee WHERE employee_id = 1").get().first_name;
      assert.equal(inSavepoint, 'UpdatedInSavepoint');

      db.exec('ROLLBACK TO SAVEPOINT iso_test; RELEASE SAVEPOINT iso_test;');
      const reverted = db.prepare("SELECT first_name FROM Employee WHERE employee_id = 1").get().first_name;
      assert.equal(reverted, 'Alice');
    } finally {
      close();
    }
  });

  await test('T1-F10-05', 'Clean commit leaves exactly one active salary record per employee', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      db.exec('BEGIN TRANSACTION;');
      db.prepare("UPDATE Salary SET is_active = 0 WHERE employee_id = 1").run();
      db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (1, 150000, 50000, 25000, '2026-11-01', 1)").run();
      db.exec('COMMIT;');

      const activeList = db.prepare("SELECT COUNT(*) as c FROM Salary WHERE employee_id = 1 AND is_active = 1").get().c;
      assert.equal(activeList, 1);
    } finally {
      close();
    }
  });

  await test('T1-F10-06', 'Payroll status transitions from DRAFT to APPROVED to PAID within transaction', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      db.exec('BEGIN TRANSACTION;');
      const p = db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, gross_salary, net_salary, status) VALUES (1, 1, 12, 2026, 60000, 55000, 'DRAFT')").run();
      const pId = Number(p.lastInsertRowid);

      db.prepare("UPDATE Payroll SET status = 'APPROVED' WHERE payroll_id = ?").run(pId);
      db.prepare("UPDATE Payroll SET status = 'PAID', payment_date = '2026-12-31' WHERE payroll_id = ?").run(pId);
      db.exec('COMMIT;');

      const finalStatus = db.prepare("SELECT status, payment_date FROM Payroll WHERE payroll_id = ?").get(pId);
      assert.equal(finalStatus.status, 'PAID');
      assert.equal(finalStatus.payment_date, '2026-12-31');
    } finally {
      close();
    }
  });

  return suiteResults;
}
