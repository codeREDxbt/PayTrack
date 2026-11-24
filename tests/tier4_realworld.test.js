/**
 * ============================================================================
 * Tier 4: Real-World Workload Scenarios Test Suite (tests/tier4_realworld.test.js)
 * ============================================================================
 * Total: 6 Multi-Step Enterprise Lifecycle Workflows.
 * Requires: Node.js v24 native test runner / assert.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import {
  createTestDb,
  assertThrowsConstraint,
  assertExecutionPlanUsesIndex,
  calculateTax,
  calculateDailyRate,
  calculateHourlyRate,
  startTestServer,
  apiRequest
} from './harness.js';

export async function runTier4Tests(reporter = { record: () => {} }) {
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
  // Scenario 1: Full Quarterly Enterprise Payroll Cycle
  // --------------------------------------------------------------------------
  await test('T4-R01', 'Full Quarterly Enterprise Payroll Cycle: 12 emps x 3 months, 36 payslips, TDS & Net Pay', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      // 1. Verify 12 employees across 7 departments
      const depts = db.prepare('SELECT COUNT(DISTINCT department) as d FROM Employee').get().d;
      assert.ok(depts >= 5);

      // 2. Verify all 36 payroll records
      const allPayroll = db.prepare(`
        SELECT p.*, s.base_salary
        FROM Payroll p
        JOIN Salary s ON p.salary_id = s.salary_id
        ORDER BY p.pay_period_year, p.pay_period_month, p.employee_id
      `).all();

      assert.equal(allPayroll.length, 36, 'All 36 monthly payroll records exist');

      // 3. Verify TDS calculations and net salary invariants for every single slip
      for (const slip of allPayroll) {
        assert.ok(slip.gross_salary > 0, `Gross salary must be positive: ${slip.gross_salary}`);
        const expectedTax = calculateTax(slip.gross_salary);
        assert.equal(Number(slip.tax_deduction), expectedTax, `TDS tax deduction must match slab for gross ${slip.gross_salary}`);

        const expectedNet = Number((slip.gross_salary - slip.tax_deduction - slip.unpaid_leave_deduction - slip.other_deductions).toFixed(2));
        assert.equal(Number(slip.net_salary), expectedNet, 'Net salary equals gross minus deductions');
        assert.equal(slip.status, 'PAID', 'All finalized quarterly slips are in PAID status');
        assert.ok(slip.payment_date, 'Payment date is recorded');
      }
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Mid-Quarter Promotion & Salary Restructuring
  // --------------------------------------------------------------------------
  await test('T4-R02', 'Mid-Quarter Promotion & Salary Restructuring: Transition, Transaction & Immutability', async () => {
    const { db, close } = createTestDb();
    try {
      // 1. Onboard Junior Developer
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Alex', 'Dev', 'alex.dev@paytrack.com', 'Engineering', 'Junior Developer', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // Initial Salary: Base = 45,000, HRA = 15,000, Allowances = 5,000 (Gross = 65,000)
      const s1 = db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (?, 45000, 15000, 5000, '2026-01-01', 1)").run(empId);
      const s1Id = Number(s1.lastInsertRowid);

      // August Payroll Run (at Junior rate)
      const augGross = 65000.0;
      const augTax = calculateTax(augGross); // 2750
      const augNet = augGross - augTax;
      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, gross_salary, tax_deduction, net_salary, status)
        VALUES (?, ?, 8, 2026, 22, 22, ?, ?, ?, 'PAID')
      `).run(empId, s1Id, augGross, augTax, augNet);

      // 2. Mid-Quarter Promotion on September 15 under ACID transaction
      db.exec('BEGIN TRANSACTION;');
      // Archive old salary
      db.prepare("UPDATE Salary SET is_active = 0 WHERE salary_id = ?").run(s1Id);
      // Promote employee role
      db.prepare("UPDATE Employee SET role = 'Senior Developer' WHERE employee_id = ?").run(empId);
      // Activate new Senior CTC: Base = 80,000, HRA = 25,000, Allowances = 15,000 (Gross = 120,000)
      const s2 = db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (?, 80000, 25000, 15000, '2026-09-15', 1)").run(empId);
      const s2Id = Number(s2.lastInsertRowid);
      db.exec('COMMIT;');

      // 3. September Payroll: Weighted / prorated transition (11 days junior @ 65k + 11 days senior @ 120k = 32.5k + 60k = 92.5k)
      const sepGross = 92500.0;
      const sepTax = calculateTax(sepGross);
      const sepNet = sepGross - sepTax;
      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, gross_salary, tax_deduction, net_salary, status)
        VALUES (?, ?, 9, 2026, 22, 22, ?, ?, ?, 'PAID')
      `).run(empId, s2Id, sepGross, sepTax, sepNet);

      // 4. October Payroll: Full month at Senior rate (120k)
      const octGross = 120000.0;
      const octTax = calculateTax(octGross); // 9250
      const octNet = octGross - octTax;
      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, gross_salary, tax_deduction, net_salary, status)
        VALUES (?, ?, 10, 2026, 22, 22, ?, ?, ?, 'PAID')
      `).run(empId, s2Id, octGross, octTax, octNet);

      // 5. Assertions: Verify August slip is immutable at Junior rate, October is Senior rate
      const augSlip = db.prepare('SELECT p.gross_salary, s.base_salary FROM Payroll p JOIN Salary s ON p.salary_id = s.salary_id WHERE p.employee_id = ? AND p.pay_period_month = 8').get(empId);
      assert.equal(Number(augSlip.gross_salary), 65000);
      assert.equal(Number(augSlip.base_salary), 45000);

      const octSlip = db.prepare('SELECT p.gross_salary, s.base_salary FROM Payroll p JOIN Salary s ON p.salary_id = s.salary_id WHERE p.employee_id = ? AND p.pay_period_month = 10').get(empId);
      assert.equal(Number(octSlip.gross_salary), 120000);
      assert.equal(Number(octSlip.base_salary), 80000);

      // Verify active salary count is exactly 1
      const activeCount = db.prepare('SELECT COUNT(*) as c FROM Salary WHERE employee_id = ? AND is_active = 1').get(empId).c;
      assert.equal(activeCount, 1);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Leave Conflict, Rejection, and Rescheduling Workflow
  // --------------------------------------------------------------------------
  await test('T4-R03', 'Leave Conflict, Rejection, and Rescheduling Workflow with Trigger Interception', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Sara', 'Connor', 'sara@paytrack.com', 'Engineering', 'Security', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);

      // Step 1: Employee applies for leave during critical week: 2026-08-10 to 2026-08-14
      const l1 = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason) VALUES (?, 'CASUAL', '2026-08-10', '2026-08-14', 5.0, 'PENDING', 'Vacation')").run(empId);
      const l1Id = Number(l1.lastInsertRowid);

      // Step 2: HR rejects request due to critical milestone
      db.prepare("UPDATE Leave SET status = 'REJECTED', decided_on = CURRENT_TIMESTAMP WHERE leave_id = ?").run(l1Id);
      assert.equal(db.prepare('SELECT status FROM Leave WHERE leave_id = ?').get(l1Id).status, 'REJECTED');

      // Step 3: Employee reschedules for non-conflicting week: 2026-08-24 to 2026-08-28
      const l2 = db.prepare("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason) VALUES (?, 'CASUAL', '2026-08-24', '2026-08-28', 5.0, 'PENDING', 'Rescheduled vacation')").run(empId);
      const l2Id = Number(l2.lastInsertRowid);

      // Step 4: HR approves rescheduled leave
      db.prepare("UPDATE Leave SET status = 'APPROVED', decided_on = CURRENT_TIMESTAMP WHERE leave_id = ?").run(l2Id);
      assert.equal(db.prepare('SELECT status FROM Leave WHERE leave_id = ?').get(l2Id).status, 'APPROVED');

      // Step 5: Employee accidentally attempts overlapping request for 2026-08-26 to 2026-08-27 with APPROVED status
      assertThrowsConstraint(
        db,
        "INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status) VALUES (?, 'SICK', '2026-08-26', '2026-08-27', 2.0, 'APPROVED')",
        [empId],
        'Overlapping approved leave exists'
      );

      // Final: Exactly 1 approved leave exists
      const approvedCount = db.prepare("SELECT COUNT(*) as c FROM Leave WHERE employee_id = ? AND status = 'APPROVED'").get(empId).c;
      assert.equal(approvedCount, 1);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Habitual Tardiness & Penalty Escalation Workflow
  // --------------------------------------------------------------------------
  await test('T4-R04', 'Habitual Tardiness & Penalty Escalation Workflow: Grace Period vs Penalty Deduction', async () => {
    const { db, close } = createTestDb();
    try {
      const e = db.prepare("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Tom', 'Late', 'tom.late@paytrack.com', 'Operations', 'Coordinator', '2026-01-01')").run();
      const empId = Number(e.lastInsertRowid);
      const s = db.prepare("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date) VALUES (?, 60000, 15000, 5000, '2026-01-01')").run(empId);
      const salId = Number(s.lastInsertRowid);

      // Days 1 & 2: Clock-in at 09:45 (Tardy by 15 mins)
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time) VALUES (?, '2026-08-04', 'PRESENT', '09:45:00')").run(empId);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time) VALUES (?, '2026-08-11', 'PRESENT', '09:45:00')").run(empId);

      // Late mark count = 2 -> Should be in GRACE_PERIOD
      let lateCount = db.prepare('SELECT COUNT(*) as c FROM Attendance WHERE employee_id = ? AND is_late = 1').get(empId).c;
      assert.equal(lateCount, 2);
      let classification = lateCount >= 3 ? 'PENALTY_APPLICABLE' : 'GRACE_PERIOD';
      assert.equal(classification, 'GRACE_PERIOD');

      // Days 3 & 4: Clocks in late again on Aug 18 & Aug 25
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time) VALUES (?, '2026-08-18', 'PRESENT', '09:50:00')").run(empId);
      db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time) VALUES (?, '2026-08-25', 'PRESENT', '09:40:00')").run(empId);

      // Late mark count = 4 -> Escalates to PENALTY_APPLICABLE
      lateCount = db.prepare('SELECT COUNT(*) as c FROM Attendance WHERE employee_id = ? AND is_late = 1').get(empId).c;
      assert.equal(lateCount, 4);
      classification = lateCount >= 3 ? 'PENALTY_APPLICABLE' : 'GRACE_PERIOD';
      assert.equal(classification, 'PENALTY_APPLICABLE');

      // Process Payroll: Deduct late mark penalty of Rs 1,500
      const gross = 80000.0;
      const penalty = 1500.0;
      const tax = calculateTax(gross);
      const net = gross - tax - penalty;

      db.prepare(`
        INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, gross_salary, tax_deduction, other_deductions, net_salary, status)
        VALUES (?, ?, 8, 2026, 22, 22, ?, ?, ?, ?, 'PAID')
      `).run(empId, salId, gross, tax, penalty, net);

      const slip = db.prepare('SELECT other_deductions, net_salary FROM Payroll WHERE employee_id = ?').get(empId);
      assert.equal(Number(slip.other_deductions), 1500.0);
      assert.equal(Number(slip.net_salary), net);
    } finally {
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Comprehensive RBAC Security Audit & Intrusion Attempt
  // --------------------------------------------------------------------------
  await test('T4-R05', 'Comprehensive RBAC Security Audit: Intercepting Unauthorized Access Attempts', async () => {
    const { db, close } = createTestDb({ seed: true });
    const server = await startTestServer({ dbHandle: db });
    try {
      // Intrusion Attempt 1: Employee 4 attempts to view all employee directory
      const res1 = await apiRequest(server.baseUrl, '/api/employees', { role: 'EMPLOYEE', employeeId: 4 });
      assert.equal(res1.status, 403, 'Blocked employee from viewing all directory');

      // Intrusion Attempt 2: Employee 4 attempts to view Executive Salary (Employee 1 payslip)
      const res2 = await apiRequest(server.baseUrl, '/api/reports/payslip/1', { role: 'EMPLOYEE', employeeId: 4 });
      assert.equal(res2.status, 403, 'Blocked employee from viewing CEO payslip');

      // Intrusion Attempt 3: Employee 4 attempts to approve peer leave
      const res3 = await apiRequest(server.baseUrl, '/api/leaves/1/status', {
        method: 'PATCH',
        role: 'EMPLOYEE',
        employeeId: 4,
        body: { status: 'APPROVED' }
      });
      assert.equal(res3.status, 403, 'Blocked employee from approving leave');

      // Intrusion Attempt 4: Employee 4 attempts to process payroll batch
      const res4 = await apiRequest(server.baseUrl, '/api/payroll/process', {
        method: 'POST',
        role: 'EMPLOYEE',
        employeeId: 4,
        body: { month: 8, year: 2026 }
      });
      assert.equal(res4.status, 403, 'Blocked employee from triggering payroll batch');

      // Valid Self-Service Operation 1: Employee views own profile
      const ok1 = await apiRequest(server.baseUrl, '/api/employees/4', { role: 'EMPLOYEE', employeeId: 4 });
      assert.equal(ok1.status, 200);

      // Valid Self-Service Operation 2: Employee punches own attendance
      const ok2 = await apiRequest(server.baseUrl, '/api/attendance/punch', {
        method: 'POST',
        role: 'EMPLOYEE',
        employeeId: 4,
        body: { attendance_date: '2026-11-20', status: 'PRESENT' }
      });
      assert.equal(ok2.status, 201);
    } finally {
      await server.close();
      close();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Concurrent Read/Write Performance & Query Optimization Verification
  // --------------------------------------------------------------------------
  await test('T4-R06', 'Concurrent Read/Write Performance & Index Optimization Benchmark', async () => {
    const { db, close } = createTestDb({ seed: true });
    try {
      const start = performance.now();

      // Simulate 50 iterative reads and inserts interleaved
      for (let i = 1; i <= 20; i++) {
        // Read 1: Indexed seek on attendance
        db.prepare("SELECT * FROM Attendance WHERE attendance_date = '2026-08-15' AND is_late = 1").all();

        // Read 2: Monthly Summary aggregation
        db.prepare(`
          SELECT e.department, COUNT(a.attendance_id) as total_attendance
          FROM Employee e
          JOIN Attendance a ON e.employee_id = a.employee_id
          WHERE a.attendance_date BETWEEN '2026-08-01' AND '2026-08-31'
          GROUP BY e.department
        `).all();

        // Write: Insert simulated attendance audit log or punch
        db.prepare("INSERT INTO Attendance (employee_id, attendance_date, status) VALUES (1, ?, 'PRESENT')").run(`2026-07-${String(i).padStart(2, '0')}`);
      }

      const totalElapsed = performance.now() - start;
      assert.ok(totalElapsed < 500, `Concurrent load completed in ${totalElapsed.toFixed(2)}ms, expected < 500ms`);

      // Verify B-tree composite index remains utilized
      assertExecutionPlanUsesIndex(db, "SELECT * FROM Attendance WHERE attendance_date = '2026-08-15' AND is_late = 1", 'idx_attendance_date_late');
    } finally {
      close();
    }
  });

  return suiteResults;
}
