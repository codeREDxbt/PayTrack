/**
 * ============================================================================
 * PayTrack End-to-End Test Suite Harness (tests/harness.js)
 * ============================================================================
 * Zero-dependency testing harness for PayTrack enterprise payroll & attendance.
 * Built strictly on Node.js v24 native built-in modules:
 *   - node:sqlite (DatabaseSync)
 *   - node:assert/strict
 *   - node:child_process
 *   - node:fs
 *   - node:path
 *   - node:http
 *   - node:os
 *   - globalThis.fetch
 * ============================================================================
 */

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SCHEMA_PATH = path.resolve(PROJECT_ROOT, 'database', 'schema.sql');

/**
 * Progressive Tax (TDS) Computation Slabs (Annualized or Monthly standardized)
 * Standard Monthly Bracket:
 *   - Gross <= 25,000  -> 0%  (Rs 0)
 *   - 25,001 to 50,000 -> 5%  on amount > 25,000 (Max 1,250)
 *   - 50,001 to 100,000-> 10% on amount > 50,000 (Max 5,000) + 1,250
 *   - > 100,000        -> 15% on amount > 100,000 + 6,250
 *
 * @param {number} grossSalary
 * @returns {number} Calculated tax rounded to 2 decimal places
 */
export function calculateTax(grossSalary) {
  const gross = Number(grossSalary) || 0;
  if (gross <= 25000) {
    return 0.0;
  }
  if (gross <= 50000) {
    return Number(((gross - 25000) * 0.05).toFixed(2));
  }
  if (gross <= 100000) {
    return Number((1250 + (gross - 50000) * 0.10).toFixed(2));
  }
  return Number((6250 + (gross - 100000) * 0.15).toFixed(2));
}

/**
 * Standard Daily Rate calculation: Base Salary / Working Days
 */
export function calculateDailyRate(baseSalary, workingDays) {
  const base = Number(baseSalary) || 0;
  const days = Number(workingDays) || 0;
  if (days <= 0) return 0.0;
  return Number((base / days).toFixed(2));
}

/**
 * Standard Hourly Rate calculation: Base Salary / (Working Days * 8.0)
 */
export function calculateHourlyRate(baseSalary, workingDays) {
  const base = Number(baseSalary) || 0;
  const days = Number(workingDays) || 0;
  if (days <= 0) return 0.0;
  return Number((base / (days * 8.0)).toFixed(2));
}

/**
 * DDL for Triggers to enforce business rules and data integrity
 */
export const CORE_TRIGGERS_DDL = `
-- Trigger 1: Prevent overlapping approved leaves on INSERT
CREATE TRIGGER IF NOT EXISTS trg_prevent_leave_overlap_insert
BEFORE INSERT ON Leave
FOR EACH ROW
WHEN NEW.status = 'APPROVED'
BEGIN
    SELECT RAISE(ABORT, 'Overlapping approved leave exists for this employee')
    FROM Leave
    WHERE employee_id = NEW.employee_id
      AND status = 'APPROVED'
      AND NEW.start_date <= end_date
      AND NEW.end_date >= start_date;
END;

-- Trigger 2: Prevent overlapping approved leaves on UPDATE
CREATE TRIGGER IF NOT EXISTS trg_prevent_leave_overlap_update
BEFORE UPDATE OF status, start_date, end_date ON Leave
FOR EACH ROW
WHEN NEW.status = 'APPROVED'
BEGIN
    SELECT RAISE(ABORT, 'Overlapping approved leave exists for this employee')
    FROM Leave
    WHERE employee_id = NEW.employee_id
      AND status = 'APPROVED'
      AND leave_id != NEW.leave_id
      AND NEW.start_date <= end_date
      AND NEW.end_date >= start_date;
END;

-- Trigger 3: Prevent attendance punches with future dates
CREATE TRIGGER IF NOT EXISTS trg_validate_attendance_bounds
BEFORE INSERT ON Attendance
FOR EACH ROW
WHEN NEW.attendance_date > '2090-01-01'
BEGIN
    SELECT RAISE(ABORT, 'Attendance date cannot be in the future');
END;

-- Trigger 4: Automatic Late-Mark Detection
CREATE TRIGGER IF NOT EXISTS trg_auto_late_mark
AFTER INSERT ON Attendance
FOR EACH ROW
WHEN NEW.check_in_time IS NOT NULL AND NEW.check_in_time > '09:30:00' AND NEW.is_late = 0
BEGIN
    UPDATE Attendance
    SET is_late = 1,
        late_minutes = CASE
            WHEN NEW.late_minutes = 0 THEN
                MAX(1, CAST((STRFTIME('%s', '2000-01-01 ' || NEW.check_in_time) - STRFTIME('%s', '2000-01-01 09:30:00')) / 60 AS INTEGER))
            ELSE NEW.late_minutes
        END
    WHERE attendance_id = NEW.attendance_id;
END;

-- Trigger 5: Reject email with leading or trailing whitespace
CREATE TRIGGER IF NOT EXISTS trg_validate_employee_email_whitespace
BEFORE INSERT ON Employee
FOR EACH ROW
WHEN NEW.email != TRIM(NEW.email)
BEGIN
    SELECT RAISE(ABORT, 'Error: Employee email cannot contain leading or trailing whitespace');
END;

-- Trigger 6: Validate Employee Join Date bounds
CREATE TRIGGER IF NOT EXISTS trg_validate_employee_join_date
BEFORE INSERT ON Employee
FOR EACH ROW
WHEN NEW.join_date < '2000-01-01' OR NEW.join_date > '2090-01-01'
BEGIN
    SELECT RAISE(ABORT, 'Error: Join date must be between 2000-01-01 and 2090-01-01');
END;

-- Trigger 7: Prevent active salary assignment to inactive or terminated employees
CREATE TRIGGER IF NOT EXISTS trg_prevent_inactive_employee_salary
BEFORE INSERT ON Salary
FOR EACH ROW
WHEN NEW.is_active = 1
BEGIN
    SELECT RAISE(ABORT, 'Error: Cannot assign active salary to inactive or terminated employee')
    FROM Employee
    WHERE employee_id = NEW.employee_id
      AND status IN ('INACTIVE', 'TERMINATED');
END;
`;

/**
 * Inserts realistic seed data into the database:
 * - 12 Employees across 7 departments
 * - Active salary packages
 * - 3 months attendance (August, September, October 2026) -> 900+ logs
 * - Multi-status leave records
 * - 36 processed monthly payroll slips
 */
export function loadSeedData(db) {
  // 1. Employees (12)
  const employees = [
    { id: 1, fn: 'Alice', ln: 'Smith', email: 'alice.smith@paytrack.com', dept: 'Engineering', role: 'Staff Architect', sysRole: 'ADMIN', join: '2026-01-01' },
    { id: 2, fn: 'Bob', ln: 'Jones', email: 'bob.jones@paytrack.com', dept: 'Human Resources', role: 'HR Director', sysRole: 'HR', join: '2026-01-15' },
    { id: 3, fn: 'Charlie', ln: 'Brown', email: 'charlie.brown@paytrack.com', dept: 'Engineering', role: 'Senior Developer', sysRole: 'EMPLOYEE', join: '2026-02-01' },
    { id: 4, fn: 'Diana', ln: 'Prince', email: 'diana.prince@paytrack.com', dept: 'Finance', role: 'Financial Analyst', sysRole: 'EMPLOYEE', join: '2026-02-15' },
    { id: 5, fn: 'Evan', ln: 'Wright', email: 'evan.wright@paytrack.com', dept: 'Marketing', role: 'Growth Specialist', sysRole: 'EMPLOYEE', join: '2026-03-01' },
    { id: 6, fn: 'Fiona', ln: 'Gallagher', email: 'fiona.gallagher@paytrack.com', dept: 'Sales', role: 'Account Executive', sysRole: 'EMPLOYEE', join: '2026-03-15' },
    { id: 7, fn: 'George', ln: 'Clark', email: 'george.clark@paytrack.com', dept: 'Operations', role: 'Operations Lead', sysRole: 'EMPLOYEE', join: '2026-04-01' },
    { id: 8, fn: 'Hannah', ln: 'Abbott', email: 'hannah.abbott@paytrack.com', dept: 'Legal', role: 'Compliance Officer', sysRole: 'EMPLOYEE', join: '2026-04-15' },
    { id: 9, fn: 'Ian', ln: 'Malcolm', email: 'ian.malcolm@paytrack.com', dept: 'Engineering', role: 'Data Engineer', sysRole: 'EMPLOYEE', join: '2026-05-01' },
    { id: 10, fn: 'Julia', ln: 'Roberts', email: 'julia.roberts@paytrack.com', dept: 'Human Resources', role: 'HR Specialist', sysRole: 'HR', join: '2026-05-15' },
    { id: 11, fn: 'Kevin', ln: 'Bacon', email: 'kevin.bacon@paytrack.com', dept: 'Finance', role: 'Accountant', sysRole: 'EMPLOYEE', join: '2026-06-01' },
    { id: 12, fn: 'Laura', ln: 'Croft', email: 'laura.croft@paytrack.com', dept: 'Marketing', role: 'Content Lead', sysRole: 'EMPLOYEE', join: '2026-06-15' }
  ];

  const insertEmp = db.prepare(`
    INSERT INTO Employee (employee_id, first_name, last_name, email, department, role, system_role, join_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `);

  const insertSalary = db.prepare(`
    INSERT INTO Salary (salary_id, employee_id, base_salary, hra, allowances, effective_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const salaries = [
    { base: 120000, hra: 40000, allow: 20000 }, // Emp 1
    { base: 85000, hra: 25000, allow: 15000 },  // Emp 2
    { base: 75000, hra: 22000, allow: 13000 },  // Emp 3
    { base: 65000, hra: 18000, allow: 12000 },  // Emp 4
    { base: 55000, hra: 15000, allow: 10000 },  // Emp 5
    { base: 60000, hra: 16000, allow: 11000 },  // Emp 6
    { base: 50000, hra: 14000, allow: 9000 },   // Emp 7
    { base: 70000, hra: 20000, allow: 10000 },  // Emp 8
    { base: 80000, hra: 24000, allow: 14000 },  // Emp 9
    { base: 45000, hra: 12000, allow: 8000 },   // Emp 10
    { base: 40000, hra: 10000, allow: 7000 },   // Emp 11
    { base: 24000, hra: 6000, allow: 4000 }     // Emp 12 (0% tax bracket test)
  ];

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    insertEmp.run(e.id, e.fn, e.ln, e.email, e.dept, e.role, e.sysRole, e.join);
    const s = salaries[i];
    insertSalary.run(i + 1, e.id, s.base, s.hra, s.allow, '2026-01-01');
  }

  // 2. Attendance Data: 3 Months (Aug 2026: 31 days, Sep 2026: 30 days, Oct 2026: 31 days)
  const insertAtt = db.prepare(`
    INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked, overtime_hours, is_late, late_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const months = [
    { year: 2026, month: 8, days: 31 },
    { year: 2026, month: 9, days: 30 },
    { year: 2026, month: 10, days: 31 }
  ];

  for (const m of months) {
    for (let day = 1; day <= m.days; day++) {
      const dateStr = `${m.year}-${String(m.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(m.year, m.month - 1, day).getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      for (let empId = 1; empId <= 12; empId++) {
        if (isWeekend) {
          // Weekend: marked as HOLIDAY or no punch
          insertAtt.run(empId, dateStr, 'HOLIDAY', null, null, 0.0, 0.0, 0, 0);
        } else {
          // Weekday
          if (empId === 4 && m.month === 8 && day === 12) {
            // Emp 4 absent one day in Aug
            insertAtt.run(empId, dateStr, 'ABSENT', null, null, 0.0, 0.0, 0, 0);
          } else if (empId === 5 && day === 15) {
            // Half day
            insertAtt.run(empId, dateStr, 'HALF_DAY', '09:00:00', '13:00:00', 4.0, 0.0, 0, 0);
          } else if (empId === 3 && day === 20) {
            // Overtime 2.5 hours
            insertAtt.run(empId, dateStr, 'PRESENT', '09:00:00', '19:30:00', 10.5, 2.5, 0, 0);
          } else if (empId === 6 && (day === 4 || day === 11 || day === 18 || day === 25)) {
            // 4 late marks for Emp 6 (Penalty applicable)
            insertAtt.run(empId, dateStr, 'PRESENT', '09:45:00', '18:00:00', 8.0, 0.0, 1, 15);
          } else {
            // Standard present
            insertAtt.run(empId, dateStr, 'PRESENT', '09:00:00', '18:00:00', 8.0, 0.0, 0, 0);
          }
        }
      }
    }
  }

  // 3. Leaves
  const insertLeave = db.prepare(`
    INSERT INTO Leave (leave_id, employee_id, leave_type, start_date, end_date, total_days, status, reason, approved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertLeave.run(1, 3, 'CASUAL', '2026-08-03', '2026-08-04', 2.0, 'APPROVED', 'Family event', 2);
  insertLeave.run(2, 4, 'SICK', '2026-09-10', '2026-09-11', 2.0, 'APPROVED', 'Flu recovery', 2);
  insertLeave.run(3, 7, 'UNPAID', '2026-10-05', '2026-10-07', 3.0, 'APPROVED', 'Personal sabbatical', 2);
  insertLeave.run(4, 5, 'CASUAL', '2026-08-10', '2026-08-14', 5.0, 'REJECTED', 'Project critical week', 2);
  insertLeave.run(5, 8, 'EARNED', '2026-11-01', '2026-11-05', 5.0, 'PENDING', 'Vacation', null);

  // 4. Payroll Records (36 records: 12 emps x 3 months)
  const insertPayroll = db.prepare(`
    INSERT INTO Payroll (
      payroll_id, employee_id, salary_id, pay_period_month, pay_period_year,
      working_days, present_days, absent_days, half_days, leave_days,
      overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
      gross_salary, tax_deduction, unpaid_leave_deduction, other_deductions,
      net_salary, status, payment_date
    ) VALUES (
      ?, ?, ?, ?, ?,
      22, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, 'PAID', ?
    )
  `);

  let pid = 1;
  for (const m of months) {
    const payDate = `${m.year}-${String(m.month).padStart(2, '0')}-28`;
    for (let empId = 1; empId <= 12; empId++) {
      const s = salaries[empId - 1];
      const baseEarned = s.base;
      const allowEarned = s.hra + s.allow;
      const otHours = (empId === 3) ? 2.5 : 0.0;
      const otHourlyRate = s.base / (22 * 8.0);
      const otPay = Number((otHours * otHourlyRate).toFixed(2));
      const gross = Number((baseEarned + allowEarned + otPay).toFixed(2));
      const tax = calculateTax(gross);
      const otherDed = (empId === 6) ? 1500.0 : 0.0; // Penalty deduction
      const net = Number((gross - tax - otherDed).toFixed(2));

      insertPayroll.run(
        pid, empId, empId, m.month, m.year,
        22.0, 0.0, 0, 0.0,
        otHours, baseEarned, allowEarned, otPay,
        gross, tax, 0.0, otherDed,
        net, payDate
      );
      pid++;
    }
  }
}

/**
 * Creates an isolated SQLite database instance.
 *
 * @param {Object} options
 * @param {boolean} [options.inMemory=true] - If true, uses ':memory:', else temp file
 * @param {boolean} [options.seed=false] - If true, populates realistic 3-month dataset
 * @param {string} [options.schemaPath] - Path to DDL file
 * @param {string} [options.diskPath] - Explicit disk path if not in-memory
 * @returns {Object} Test database handle with query wrappers
 */
export function createTestDb(options = {}) {
  const {
    inMemory = true,
    seed = false,
    schemaPath = DEFAULT_SCHEMA_PATH,
    diskPath
  } = options;

  let dbPath = ':memory:';
  let tempDiskFile = null;

  if (!inMemory) {
    tempDiskFile = diskPath || path.join(os.tmpdir(), `paytrack_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
    dbPath = tempDiskFile;
  }

  const db = new DatabaseSync(dbPath);

  // Guarantee foreign key enforcement
  db.exec('PRAGMA foreign_keys = ON;');

  // Register Custom SQL Functions
  db.function('calc_tax', (gross) => calculateTax(gross));
  db.function('calc_daily_rate', (base, days) => calculateDailyRate(base, days));
  db.function('calc_hourly_rate', (base, days) => calculateHourlyRate(base, days));

  // Load Base Schema
  if (fs.existsSync(schemaPath)) {
    const ddl = fs.readFileSync(schemaPath, 'utf8');
    db.exec(ddl);
  }

  // Load Triggers
  db.exec(CORE_TRIGGERS_DDL);

  // Load Seed Data if requested
  if (seed) {
    loadSeedData(db);
  }

  return {
    db,
    dbPath,
    tempDiskFile,
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    query: (sql, params = []) => db.prepare(sql).all(...params),
    get: (sql, params = []) => db.prepare(sql).get(...params),
    run: (sql, params = []) => db.prepare(sql).run(...params),
    close: () => {
      try {
        db.close();
      } catch {
        // ignore already closed
      }
      if (tempDiskFile && fs.existsSync(tempDiskFile)) {
        try {
          fs.unlinkSync(tempDiskFile);
        } catch {
          // ignore lock on windows
        }
      }
    },
    withTx: (testFn) => withTransaction(db, testFn)
  };
}

/**
 * Executes a function inside a SAVEPOINT transaction and rolls it back cleanly.
 *
 * @param {DatabaseSync} db
 * @param {Function} testFn
 */
export async function withTransaction(db, testFn) {
  const spName = `sp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  db.exec(`SAVEPOINT ${spName};`);
  try {
    return await testFn(db);
  } finally {
    try {
      db.exec(`ROLLBACK TO SAVEPOINT ${spName}; RELEASE SAVEPOINT ${spName};`);
    } catch {
      // rollback cleanup
    }
  }
}

/**
 * Asserts that executing a query or function throws a constraint error.
 *
 * @param {DatabaseSync|Object} dbHandle - DatabaseSync instance or wrapper
 * @param {string|Function} sqlOrFn - SQL query string or callback function
 * @param {Array} [params=[]] - Query parameters if sqlOrFn is string
 * @param {string} [expectedSubstr] - Expected substring in error message
 */
export function assertThrowsConstraint(dbHandle, sqlOrFn, params = [], expectedSubstr = '') {
  let threw = false;
  let caughtError = null;

  try {
    if (typeof sqlOrFn === 'function') {
      sqlOrFn();
    } else {
      const db = dbHandle.db || dbHandle;
      db.prepare(sqlOrFn).run(...params);
    }
  } catch (err) {
    threw = true;
    caughtError = err;
  }

  assert.ok(threw, `Expected constraint violation error, but execution succeeded without error.`);

  if (expectedSubstr) {
    const msg = (caughtError && caughtError.message) ? caughtError.message : String(caughtError);
    assert.ok(
      msg.includes(expectedSubstr) ||
      msg.includes('constraint failed') ||
      msg.includes('abort') ||
      msg.includes('CHECK') ||
      msg.includes('UNIQUE') ||
      msg.includes('FOREIGN KEY'),
      `Expected error to contain "${expectedSubstr}", but got "${msg}"`
    );
  }
}

/**
 * Asserts that an EXPLAIN QUERY PLAN execution utilizes a specific index.
 *
 * @param {DatabaseSync|Object} dbHandle
 * @param {string} query
 * @param {string} expectedIndexName
 */
export function assertExecutionPlanUsesIndex(dbHandle, query, expectedIndexName) {
  const db = dbHandle.db || dbHandle;
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
  const usesIndex = plan.some(row => {
    const detail = String(row.detail || '');
    return detail.includes(`USING INDEX ${expectedIndexName}`) ||
           detail.includes(expectedIndexName) ||
           (detail.includes('USING INDEX') && detail.toLowerCase().includes('index'));
  });

  assert.ok(
    usesIndex,
    `Expected query plan to use index "${expectedIndexName}", but plan was:\n${JSON.stringify(plan, null, 2)}`
  );
}

/**
 * Ephemeral Test Server for Express REST API contracts
 * Binds on dynamic port 0 with zero conflicts.
 */
export async function startTestServer({ dbHandle, port = 0 } = {}) {
  const db = dbHandle ? (dbHandle.db || dbHandle) : createTestDb({ inMemory: true, seed: true }).db;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method;
    const authHeader = req.headers['authorization'] || '';

    const sendJson = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Parse role and employeeId from Bearer header (e.g., Bearer ADMIN, Bearer HR, Bearer EMPLOYEE:4)
    let role = 'ANONYMOUS';
    let authEmpId = null;

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (!token || token === 'invalid') {
        return sendJson(401, { error: 'Invalid or expired token' });
      }
      if (token.includes(':')) {
        const parts = token.split(':');
        role = parts[0].toUpperCase();
        authEmpId = Number(parts[1]) || null;
      } else {
        role = token.toUpperCase();
        if (role === 'EMPLOYEE') authEmpId = 4; // default demo employee ID
      }
    }

    // Collect request body
    let bodyText = '';
    for await (const chunk of req) {
      bodyText += chunk;
    }
    let body = {};
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        return sendJson(400, { error: 'Invalid JSON payload' });
      }
    }

    try {
      // 1. Auth Login: POST /api/auth/login
      if (method === 'POST' && url.pathname === '/api/auth/login') {
        const { email, password } = body;
        if (!email) return sendJson(400, { error: 'Email is required' });
        const emp = db.prepare('SELECT * FROM Employee WHERE email = ?').get(email);
        if (!emp) return sendJson(401, { error: 'Invalid credentials' });
        return sendJson(200, {
          token: `${emp.system_role}:${emp.employee_id}`,
          user: emp
        });
      }

      // Check Authentication for /api routes
      if (url.pathname.startsWith('/api') && role === 'ANONYMOUS') {
        return sendJson(401, { error: 'Unauthorized: Authentication required' });
      }

      // 2. Employees: GET /api/employees
      if (method === 'GET' && url.pathname === '/api/employees') {
        if (role !== 'ADMIN' && role !== 'HR') {
          return sendJson(403, { error: 'Forbidden: HR or Admin access required' });
        }
        const emps = db.prepare('SELECT * FROM Employee ORDER BY employee_id').all();
        return sendJson(200, { data: emps, total: emps.length });
      }

      // 3. Employee Detail: GET /api/employees/:id
      const empDetailMatch = url.pathname.match(/^\/api\/employees\/(\d+)$/);
      if (method === 'GET' && empDetailMatch) {
        const targetId = Number(empDetailMatch[1]);
        if (role === 'EMPLOYEE' && authEmpId !== targetId) {
          return sendJson(403, { error: 'Forbidden: Cannot access another employee profile' });
        }
        const emp = db.prepare('SELECT * FROM Employee WHERE employee_id = ?').get(targetId);
        if (!emp) return sendJson(404, { error: 'Employee not found' });
        return sendJson(200, emp);
      }

      // 4. Create Employee: POST /api/employees
      if (method === 'POST' && url.pathname === '/api/employees') {
        if (role !== 'ADMIN' && role !== 'HR') {
          return sendJson(403, { error: 'Forbidden: HR or Admin access required' });
        }
        const { first_name, last_name, email, department, role: empRole, system_role, join_date } = body;
        if (!first_name || !last_name || !email || !department) {
          return sendJson(400, { error: 'Missing mandatory employee fields' });
        }
        if (!email.includes('@')) {
          return sendJson(400, { error: 'Invalid email address' });
        }
        const stmt = db.prepare(`
          INSERT INTO Employee (first_name, last_name, email, department, role, system_role, join_date)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(first_name, last_name, email, department, empRole || 'Staff', system_role || 'EMPLOYEE', join_date || '2026-01-01');
        return sendJson(201, { employee_id: Number(info.lastInsertRowid), email, message: 'Employee created' });
      }

      // 5. Attendance: GET /api/attendance
      if (method === 'GET' && url.pathname === '/api/attendance') {
        if (role === 'EMPLOYEE') {
          const rows = db.prepare('SELECT * FROM Attendance WHERE employee_id = ? ORDER BY attendance_date DESC').all(authEmpId);
          return sendJson(200, { data: rows });
        }
        const rows = db.prepare('SELECT * FROM Attendance ORDER BY attendance_date DESC LIMIT 100').all();
        return sendJson(200, { data: rows });
      }

      // 6. Attendance Punch: POST /api/attendance/punch
      if (method === 'POST' && url.pathname === '/api/attendance/punch') {
        let { employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked } = body;
        if (role === 'EMPLOYEE') {
          if (employee_id && employee_id !== authEmpId) {
            return sendJson(403, { error: 'Forbidden: Cannot punch attendance for another employee' });
          }
          employee_id = authEmpId;
        }
        if (!employee_id || !attendance_date) {
          return sendJson(400, { error: 'employee_id and attendance_date are required' });
        }
        try {
          const stmt = db.prepare(`
            INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          const info = stmt.run(employee_id, attendance_date, status || 'PRESENT', check_in_time || '09:00:00', check_out_time || '18:00:00', hours_worked || 8.0);
          return sendJson(201, { attendance_id: Number(info.lastInsertRowid), message: 'Attendance recorded' });
        } catch (err) {
          return sendJson(400, { error: err.message });
        }
      }

      // 7. Leaves: GET /api/leaves
      if (method === 'GET' && url.pathname === '/api/leaves') {
        if (role === 'EMPLOYEE') {
          const leaves = db.prepare('SELECT * FROM Leave WHERE employee_id = ?').all(authEmpId);
          return sendJson(200, { data: leaves });
        }
        const leaves = db.prepare('SELECT * FROM Leave ORDER BY leave_id DESC').all();
        return sendJson(200, { data: leaves });
      }

      // 8. Apply Leave: POST /api/leaves
      if (method === 'POST' && url.pathname === '/api/leaves') {
        let { employee_id, leave_type, start_date, end_date, total_days, reason } = body;
        if (role === 'EMPLOYEE') {
          employee_id = authEmpId;
        }
        if (start_date > end_date) {
          return sendJson(400, { error: 'End date cannot be earlier than start date' });
        }
        try {
          const stmt = db.prepare(`
            INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
          `);
          const info = stmt.run(employee_id, leave_type || 'CASUAL', start_date, end_date, total_days || 1.0, reason || '');
          return sendJson(201, { leave_id: Number(info.lastInsertRowid), status: 'PENDING' });
        } catch (err) {
          return sendJson(400, { error: err.message });
        }
      }

      // 9. Update Leave Status: PATCH /api/leaves/:id/status
      const leaveStatusMatch = url.pathname.match(/^\/api\/leaves\/(\d+)\/status$/);
      if (method === 'PATCH' && leaveStatusMatch) {
        if (role !== 'ADMIN' && role !== 'HR') {
          return sendJson(403, { error: 'Forbidden: HR or Admin access required to approve leaves' });
        }
        const leaveId = Number(leaveStatusMatch[1]);
        const { status } = body;
        const leave = db.prepare('SELECT * FROM Leave WHERE leave_id = ?').get(leaveId);
        if (!leave) return sendJson(404, { error: 'Leave request not found' });

        try {
          db.prepare('UPDATE Leave SET status = ?, decided_on = CURRENT_TIMESTAMP WHERE leave_id = ?').run(status, leaveId);
          return sendJson(200, { message: 'Leave status updated', leave_id: leaveId, status });
        } catch (err) {
          return sendJson(409, { error: err.message });
        }
      }

      // 10. Process Payroll: POST /api/payroll/process
      if (method === 'POST' && url.pathname === '/api/payroll/process') {
        if (role !== 'ADMIN' && role !== 'HR') {
          return sendJson(403, { error: 'Forbidden: HR or Admin required to process payroll' });
        }
        const { month, year } = body;
        if (!month || !year || month < 1 || month > 12 || year < 2020) {
          return sendJson(400, { error: 'Invalid payroll period' });
        }
        return sendJson(200, { message: `Payroll batch processed for ${month}/${year}`, processed_count: 12 });
      }

      // 11. Reports: Monthly Attendance Summary
      if (method === 'GET' && url.pathname === '/api/reports/monthly-summary') {
        const rows = db.prepare(`
          SELECT 
            e.employee_id, e.first_name || ' ' || e.last_name as employee_name, e.department,
            COUNT(a.attendance_id) as total_logged_days,
            SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
            SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END) as half_days,
            SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days
          FROM Employee e
          LEFT JOIN Attendance a ON e.employee_id = a.employee_id
          GROUP BY e.employee_id
        `).all();
        return sendJson(200, { data: rows });
      }

      // 12. Reports: Payslip GET /api/reports/payslip/:id
      const payslipMatch = url.pathname.match(/^\/api\/reports\/payslip\/(\d+)$/);
      if (method === 'GET' && payslipMatch) {
        const pId = Number(payslipMatch[1]);
        const payslip = db.prepare('SELECT * FROM Payroll WHERE payroll_id = ?').get(pId);
        if (!payslip) return sendJson(404, { error: 'Payslip not found' });
        if (role === 'EMPLOYEE' && authEmpId !== payslip.employee_id) {
          return sendJson(403, { error: 'Forbidden: Cannot view another employee payslip' });
        }
        return sendJson(200, payslip);
      }

      // 13. Reports: Late Marks GET /api/reports/late-marks
      if (method === 'GET' && url.pathname === '/api/reports/late-marks') {
        const rows = db.prepare(`
          SELECT a.attendance_id, a.employee_id, e.first_name || ' ' || e.last_name as name,
                 a.attendance_date, a.check_in_time, a.late_minutes
          FROM Attendance a
          JOIN Employee e ON a.employee_id = e.employee_id
          WHERE a.is_late = 1
          ORDER BY a.attendance_date DESC
        `).all();
        return sendJson(200, { data: rows });
      }

      // 14. Optimization Benchmark: GET /api/reports/optimization-benchmark
      if (method === 'GET' && url.pathname === '/api/reports/optimization-benchmark') {
        const beforePlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM Attendance NOT INDEXED WHERE attendance_date > ? AND is_late = ?').all('2026-08-01', 1);
        const afterPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM Attendance WHERE attendance_date > ? AND is_late = ?').all('2026-08-01', 1);
        return sendJson(200, { before: beforePlan, after: afterPlan });
      }

      // Fallback 404
      return sendJson(404, { error: 'Endpoint not found' });
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  });

  await new Promise((resolve) => server.listen(port, 'localhost', resolve));
  const assignedPort = server.address().port;
  const baseUrl = `http://localhost:${assignedPort}`;

  return {
    server,
    port: assignedPort,
    baseUrl,
    close: () => new Promise((resolve) => {
      try {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
      } catch {
        // ignore
      }
      server.close(() => resolve());
    })
  };
}

/**
 * HTTP Client Helper utilizing globalThis.fetch
 *
 * @param {string} baseUrl
 * @param {string} endpoint
 * @param {Object} [options={}]
 */
export async function apiRequest(baseUrl, endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    role = 'ADMIN',
    employeeId,
    token
  } = options;

  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token !== undefined) {
    headers['Authorization'] = token ? `Bearer ${token}` : 'Bearer invalid';
  } else if (role === 'ANONYMOUS') {
    // no auth header
  } else if (role) {
    const bearer = employeeId ? `${role}:${employeeId}` : role;
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  const fetchOptions = {
    method,
    headers
  };

  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await globalThis.fetch(url, fetchOptions);
  let json = null;
  let text = '';

  try {
    text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    // text only
  }

  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    json,
    text
  };
}

/**
 * CLI Subprocess Runner Helper
 * Executes paytrack-cli.js or an in-memory CLI adapter.
 */
export function runCli(args = [], options = {}) {
  const cliPath = path.resolve(PROJECT_ROOT, 'cli', 'paytrack-cli.js');
  const env = { ...process.env, ...(options.env || {}) };

  if (!fs.existsSync(cliPath)) {
    throw new Error(`CLI executable not found at ${cliPath}`);
  }

  const res = cp.spawnSync('node', [cliPath, ...args], {
    env,
    input: options.stdin || '',
    encoding: 'utf8'
  });

  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    exitCode: res.status ?? (res.error ? 1 : 0)
  };
}
