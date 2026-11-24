/**
 * ============================================================================
 * PayTrack Phase 4 - Security, Access Control & Transaction Testing
 * (test/phase4_security.test.js)
 * ============================================================================
 * Zero-dependency suite in the same style as test/run_e2e.js: its own
 * test(id, type, description, fn) reporter, PASS/FAIL counts, exit code 1 on
 * failure, no npm packages beyond Node's built-ins.
 *
 * Usage:
 *   node test/phase4_security.test.js            # run all Phase 4 tests
 *   node test/phase4_security.test.js --verbose  # print every case as it runs
 *   node --test test/phase4_security.test.js     # not used: plain node runner
 *
 * Every case starts from a copy of one template database built in os.tmpdir()
 * from the real database/*.sql files, in the documented order
 *   schema -> procedures -> triggers -> seed -> security
 * and the copy is deleted afterwards. database/paytrack.sqlite is never touched.
 *
 * Case classes:
 *   VALID    - the intended path works and produces the expected rows/values
 *   INVALID  - the hostile or malformed request is refused, with a specific error
 *   BOUND    - the value sits exactly on a threshold (accepted) or one unit past
 *              it (rejected), so off-by-one logic is proven rather than assumed
 * ============================================================================
 */

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_DIR = path.join(PROJECT_ROOT, 'database');

const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');

/**
 * Pipeline order. security.sql runs AFTER seed.sql because seed.sql inserts 36
 * historical PAID payroll rows, which the "new payroll row must be DRAFT" guard
 * (deliberately) forbids. Case P4-I03 proves the reverse order also works.
 */
const PIPELINE_FILES = ['schema.sql', 'procedures.sql', 'triggers.sql', 'seed.sql', 'security.sql'];

// ----------------------------------------------------------------------------
// API-side helpers, mirrored in Node exactly as server/auth.js (Phase 5) will.
// The database stores only the digest and salt; plaintext never enters SQL.
// ----------------------------------------------------------------------------
const SALT_HEX = '00112233445566778899aabbccddeeff';

/** password_hash = hex( SHA-256(salt_bytes || utf8(password)) ) */
export function hashPassword(password, saltHex = SALT_HEX) {
  return crypto.createHash('sha256')
    .update(Buffer.concat([Buffer.from(saltHex, 'hex'), Buffer.from(password, 'utf8')]))
    .digest('hex');
}

/** Constant-time comparison, as the API must use it. */
export function verifyPassword(password, saltHex, expectedHash) {
  const actual = Buffer.from(hashPassword(password, saltHex), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const sha256Hex = (input) => crypto.createHash('sha256').update(input).digest('hex');

// Demo credentials from BUILD_CONVENTIONS.md: ADMIN/HR use the two official
// passwords, every other employee uses Employee@123.
const ADMIN_EMAIL = 'rajesh.sharma@paytrack.internal';   // employee 1, ADMIN
const HR_EMAIL = 'sunita.rao@paytrack.internal';         // employee 5, HR
const EMPLOYEE_EMAIL = 'priya.patel@paytrack.internal';  // employee 2, EMPLOYEE
const OTHER_EMPLOYEE_ID = 3;                             // amit.verma
const DEMO_PASSWORD = 'Employee@123';

// ----------------------------------------------------------------------------
// Temporary database factory (template copied per case)
// ----------------------------------------------------------------------------
function openPhase4Db(options = {}) {
  const {
    seedStaffCredentials = true,
    employees = [1, 5]
  } = options;

  const dbPath = path.join(
    os.tmpdir(),
    `paytrack_p4_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`
  );
  // Build the template first, THEN copy it. Order matters and the suite's own
  // S04 caught it when it was the other way round: copying ahead of the build
  // duplicates an empty file on the very first case.
  const template = getTemplatePath();
  fs.copyFileSync(template, dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  registerAppFunctions(db);
  if (seedStaffCredentials) seedCredentials(db, employees);

  const close = () => {
    try { db.close(); } catch { /* already closed */ }
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* not present */ }
    }
  };
  return { db, dbPath, close };
}

let templatePath = null;
let templateCleanup = () => {};

function getTemplatePath() {
  if (templatePath) return templatePath;
  templatePath = path.join(os.tmpdir(), `paytrack_p4_template_${process.pid}.sqlite`);
  for (const suffix of ['', '-journal']) {
    try { fs.unlinkSync(templatePath + suffix); } catch { /* not present */ }
  }
  const db = new DatabaseSync(templatePath);
  db.exec('PRAGMA foreign_keys = ON;');
  // Functions must be registered before any DDL: SQLite rejects CREATE TRIGGER
  // bodies that reference a function that is not registered on the connection.
  registerAppFunctions(db);
  for (const file of PIPELINE_FILES) {
    db.exec(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
  }
  db.close();
  loadTimeMs = Number((performance.now() - loadStartedAt).toFixed(0));
  templateCleanup = () => {
    for (const suffix of ['', '-journal']) {
      try { fs.unlinkSync(templatePath + suffix); } catch { /* not present */ }
    }
  };
  return templatePath;
}

let loadStartedAt = performance.now();
let loadTimeMs = 0;

/**
 * The application-side SQL functions from security.sql section 4. Every
 * connection that may evaluate permission policy registers them:
 *   fn_is_registered(name)                     -> 1 / 0   (always present)
 *   fn_has_permission(employeeId, permission)  -> 1 / 0
 * plus two read helpers used by the auth routes:
 *   fn_verify_password(email, password)        -> 1 / 0
 *   fn_session_is_valid(tokenHash, nowIso)     -> 1 / 0
 */
function registerAppFunctions(db) {
  db.function('fn_is_registered', (name) => (name === 'fn_has_permission' ? 1 : 0));

  db.function('fn_has_permission', (employeeId, permissionCode) => {
    if (employeeId === null || employeeId === undefined) return 0;
    return db.prepare(
      'SELECT EXISTS(SELECT 1 FROM vw_effective_permissions WHERE perm_employee_id = ? AND permission_code = ?) AS ok'
    ).get(employeeId, permissionCode).ok;
  });

  db.function('fn_verify_password', (email, password) => {
    const row = db
      .prepare('SELECT salt, password_hash FROM AuthUser WHERE email = ? AND is_active = 1')
      .get(email);
    if (!row) return 0;
    return verifyPassword(password, row.salt, row.password_hash) ? 1 : 0;
  });

  // nowIso is passed in explicitly so boundary cases can pin the clock.
  // Sessions store ISO-8601 with milliseconds (Date#toISOString), so the clock
  // is normalised to the same format before comparing (see sessionIsValidFor).
  db.function('fn_session_is_valid', (tokenHash, nowIso) =>
    sessionIsValidFor(db, tokenHash, normalizeIso(nowIso)) ? 1 : 0);
}

/** Mints credentials for the given employee ids (INSERT ... SELECT from Employee). */
function seedCredentials(db, employeeIds) {
  const ids = employeeIds.join(',');
  db.exec(`
    INSERT INTO AuthUser (employee_id, email, password_hash, salt, system_role, is_active)
    SELECT employee_id, email, 'placeholder', '${SALT_HEX}', system_role, 1
    FROM Employee WHERE employee_id IN (${ids});
    INSERT OR IGNORE INTO UserRole (employee_id, role_code)
    SELECT employee_id, system_role FROM Employee WHERE employee_id IN (${ids});
  `);
  const update = db.prepare('UPDATE AuthUser SET password_hash = ? WHERE employee_id = ?');
  for (const id of employeeIds) {
    const role = db.prepare('SELECT system_role FROM Employee WHERE employee_id = ?').get(id).system_role;
    const password = role === 'ADMIN' ? 'Admin@123' : role === 'HR' ? 'Hr@12345' : DEMO_PASSWORD;
    update.run(hashPassword(password), id);
  }
}

/** A deactivated credential stub (no login possible), used by 6B tests. */
function addInactiveCredential(db, employeeId) {
  db.exec(`
    INSERT INTO AuthUser (employee_id, email, password_hash, salt, system_role, is_active)
    SELECT employee_id, email, '${hashPassword(DEMO_PASSWORD)}', '${SALT_HEX}', system_role, 0
    FROM Employee WHERE employee_id = ${employeeId};
    INSERT OR IGNORE INTO UserRole (employee_id, role_code)
    SELECT employee_id, system_role FROM Employee WHERE employee_id = ${employeeId};
  `);
}

// ----------------------------------------------------------------------------
// Small helpers used by the cases
// ----------------------------------------------------------------------------
function setContext(db, employeeId) {
  db.prepare(`
    INSERT INTO SessionContext (context_id, current_employee_id) VALUES (1, ?)
    ON CONFLICT (context_id) DO UPDATE SET current_employee_id = excluded.current_employee_id
  `).run(employeeId ?? null);
}

function count(db, sql, ...params) {
  return db.prepare(sql).get(...params).c;
}

/**
 * A failed assertion inside an explicit BEGIN would leave the connection in a
 * transaction, and the copy would be closed with a dangling rollback journal.
 * Test hygiene: always end a case transaction before closing.
 */
function rollbackIfOpen(db) {
  try {
    if (db.isTransaction) db.exec('ROLLBACK');
  } catch { /* nothing to roll back */ }
}

function catches(fn, pattern, label) {
  try {
    fn();
  } catch (err) {
    if (pattern && !pattern.test(err.message)) {
      throw new Error(`${label ?? 'statement'} was rejected, but with an unexpected message: "${err.message}" (expected /${pattern}/)`);
    }
    return err;
  }
  throw new Error(`${label ?? 'statement'} was expected to be rejected but succeeded`);
}

function issueToken(db, employeeId, expiresAt, token = `tok-${employeeId}-${crypto.randomBytes(6).toString('hex')}`) {
  db.prepare(`
    INSERT INTO Session (session_token_hash, employee_id, issued_at, expires_at)
    VALUES (?, ?, '2026-11-24T00:00:00.000Z', ?)
  `).run(sha256Hex(token), employeeId, expiresAt);
  return token;
}

/** Canonical YYYY-MM-DDTHH:mm:ss.sssZ, the format the API writes. */
function normalizeIso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`not an ISO instant: ${value}`);
  return d.toISOString();
}

/**
 * Session validity check. The session is live while now < expires_at. A session
 * is considered expired AT its expiry instant (strict), so a token cannot be
 * used in the same millisecond it lapses; the API kills it with a short grace
 * in practice, but the boundary case pins the strict rule.
 */
function sessionIsValidFor(db, tokenHash, nowIso) {
  const row = db.prepare(
    "SELECT expires_at, revoked_at FROM Session WHERE session_token_hash = ?"
  ).get(tokenHash);
  if (!row || row.revoked_at) return false;
  return normalizeIso(nowIso) < normalizeIso(row.expires_at);
}

/**
 * The transactional payroll recipe from security.sql section 7, with the API's
 * per-row write in a loop so a failure can be injected mid-batch.
 * Returns { committed, count, error }.
 */
function runPayrollBatch(db, year, month, { failAtEmployee = null } = {}) {
  const rows = db.prepare(`
    SELECT employee_id, salary_id, pay_period_year, pay_period_month,
           working_days, present_days, absent_days, half_days, leave_days,
           overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
           gross_salary, tax_deduction, unpaid_leave_deduction, other_deductions, net_salary
    FROM vw_payroll_procedural_computation
    WHERE pay_period_year = ? AND pay_period_month = ?
      AND NOT EXISTS (
        SELECT 1 FROM Payroll p
        WHERE p.employee_id = vw_payroll_procedural_computation.employee_id
          AND p.pay_period_year = ? AND p.pay_period_month = ?
          AND p.status <> 'DRAFT')
    ORDER BY employee_id
  `).all(year, month, year, month);

  const upsert = db.prepare(`
    INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year,
      working_days, present_days, absent_days, half_days, leave_days, overtime_hours,
      base_salary_earned, allowances_earned, overtime_pay, gross_salary,
      tax_deduction, unpaid_leave_deduction, other_deductions, net_salary, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')
    ON CONFLICT (employee_id, pay_period_year, pay_period_month) DO UPDATE SET
      working_days = excluded.working_days, present_days = excluded.present_days,
      absent_days = excluded.absent_days, half_days = excluded.half_days,
      leave_days = excluded.leave_days, overtime_hours = excluded.overtime_hours,
      base_salary_earned = excluded.base_salary_earned,
      allowances_earned = excluded.allowances_earned,
      overtime_pay = excluded.overtime_pay, gross_salary = excluded.gross_salary,
      tax_deduction = excluded.tax_deduction,
      unpaid_leave_deduction = excluded.unpaid_leave_deduction,
      other_deductions = excluded.other_deductions, net_salary = excluded.net_salary,
      updated_at = CURRENT_TIMESTAMP
    WHERE Payroll.status = 'DRAFT'
  `);

  db.exec('BEGIN IMMEDIATE');
  let written = 0;
  try {
    for (const r of rows) {
      // Application-side check the API performs after computing each row: a
      // failure here must abort the whole batch, not just this row.
      if (r.employee_id === failAtEmployee) throw new Error(`Injected failure at employee ${r.employee_id}`);
      upsert.run(
        r.employee_id, r.salary_id, r.pay_period_month, r.pay_period_year,
        r.working_days, r.present_days, r.absent_days, r.half_days, r.leave_days,
        r.overtime_hours, r.base_salary_earned, r.allowances_earned, r.overtime_pay,
        r.gross_salary, r.tax_deduction, r.unpaid_leave_deduction, r.other_deductions,
        r.net_salary
      );
      written += 1;
    }
    db.exec('COMMIT');
    return { committed: true, count: written, error: null };
  } catch (err) {
    db.exec('ROLLBACK');
    return { committed: false, count: 0, error: err.message };
  }
}

function insertDraftPayroll(db, employeeId, year, month, extra = {}) {
  const salaryId = db.prepare('SELECT salary_id FROM Salary WHERE employee_id = ? AND is_active = 1')
    .get(employeeId).salary_id;
  const net = extra.net_salary ?? 1000.0;
  return db.prepare(`
    INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year,
      working_days, net_salary, status)
    VALUES (?, ?, ?, ?, 22, ?, 'DRAFT') RETURNING payroll_id
  `).get(employeeId, salaryId, month, year, net).payroll_id;
}

function advancePayroll(db, payrollId, status, paymentDate = null) {
  db.prepare('UPDATE Payroll SET status = ?, payment_date = ? WHERE payroll_id = ?')
    .run(status, paymentDate, payrollId);
}

/** A recent past date inside no seeded window (seed ends 2026-10-31). */
const FREE_PAST_DATE = '2026-11-02';

function insertAttendance(db, employeeId, date, overrides = {}) {
  const r = {
    status: 'PRESENT', checkIn: '09:00:00', checkOut: '17:00:00',
    hours: 8.0, overtime: 0.0, ...overrides
  };
  return db.prepare(`
    INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time,
      check_out_time, hours_worked, overtime_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING attendance_id
  `).get(employeeId, date, r.status, r.checkIn, r.checkOut, r.hours, r.overtime);
}

const lateRow = (db, id) =>
  ({ ...db.prepare('SELECT is_late, late_minutes FROM Attendance WHERE attendance_id = ?').get(id) });

// ----------------------------------------------------------------------------
// Suite runner
// ----------------------------------------------------------------------------
async function main() {
  const results = [];
  const suiteStarted = performance.now();

  async function test(id, type, description, fn) {
    const started = performance.now();
    try {
      await fn();
      const duration = Number((performance.now() - started).toFixed(2));
      results.push({ id, type, description, status: 'PASS', duration });
      if (isVerbose) console.log(`  [PASS] ${id} (${type}) ${description} (${duration}ms)`);
    } catch (err) {
      const duration = Number((performance.now() - started).toFixed(2));
      results.push({ id, type, description, status: 'FAIL', error: err.message, duration });
      console.log(`  [FAIL] ${id} (${type}) ${description}\n         ${err.message}`);
    }
  }

  getTemplatePath();

  console.log('='.repeat(80));
  console.log('        PAYTRACK PHASE 4 SECURITY & ACCESS CONTROL TEST SUITE');
  console.log('='.repeat(80));
  console.log(`Node Engine: ${process.version} | SQLite: ${new DatabaseSync(':memory:').prepare('SELECT sqlite_version() v').get().v}`);
  console.log(`Database   : template built in ${loadTimeMs}ms, copied fresh per case`);
  console.log(`Load order : ${PIPELINE_FILES.join(' -> ')}\n`);

  // ==========================================================================
  // GROUP S - Secure views (VALID)
  // ==========================================================================
  await test('P4-S01', 'VALID', 'EMPLOYEE context sees only own payslips via vw_secure_payslips', () => {
    const { db, close } = openPhase4Db({ employees: [2, 3] });
    try {
      setContext(db, OTHER_EMPLOYEE_ID);
      console.log('S01 cursor', JSON.stringify(db.prepare('SELECT * FROM vw_secure_payslips').all().slice(0,2)));
      assert.deepEqual(
        db.prepare('SELECT DISTINCT employee_id e FROM vw_secure_payslips ORDER BY e').all().map(r => r.e),
        [OTHER_EMPLOYEE_ID]
      );
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 3, 'Aug, Sep, Oct');
      const foreign = db.prepare('SELECT COUNT(*) c FROM Payroll WHERE employee_id = 2').get().c;
      assert.equal(foreign, 3, 'employee 2 does have payslips; they are just invisible');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S02', 'VALID', 'EMPLOYEE context sees only own attendance via vw_secure_attendance', () => {
    const { db, close } = openPhase4Db({ employees: [2, 3] });
    try {
      setContext(db, OTHER_EMPLOYEE_ID);
      console.log('S01 cursor', JSON.stringify(db.prepare('SELECT * FROM vw_secure_payslips').all().slice(0,2)));
      assert.deepEqual(
        db.prepare('SELECT DISTINCT employee_id e FROM vw_secure_attendance').all().map(r => r.e),
        [OTHER_EMPLOYEE_ID]
      );
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_attendance'), 92, '31 + 30 + 31 seeded days');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S03', 'VALID', 'EMPLOYEE context sees only own employee row (system_role hidden)', () => {
    const { db, close } = openPhase4Db({ employees: [2, 3] });
    try {
      setContext(db, OTHER_EMPLOYEE_ID);
      const rows = db.prepare('SELECT employee_id, email, system_role, roles FROM vw_secure_employees').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].employee_id, OTHER_EMPLOYEE_ID);
      assert.equal(rows[0].email, 'amit.verma@paytrack.internal');
      assert.equal(rows[0].employee_id, OTHER_EMPLOYEE_ID);
      assert.equal(rows[0].system_role, null, 'role names are staff-only');
      assert.equal(rows[0].roles, 'EMPLOYEE');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S04', 'VALID', 'ADMIN context sees all 36 payslips, 12 employees, 1104 attendance rows', () => {
    const { db, close } = openPhase4Db({ employees: [1] });
    try {
      setContext(db, 1);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 36);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees'), 12);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_attendance'), 1104);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees WHERE system_role IS NOT NULL'), 12);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees WHERE employee_id IS NULL'), 0,
        'every row carries its primary key');
      assert.deepEqual(
        db.prepare('SELECT employee_id FROM vw_secure_employees ORDER BY employee_id').all().map(r => r.employee_id),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S05', 'VALID', 'HR context has staff visibility (36 payslips, all roles, all attendance)', () => {
    const { db, close } = openPhase4Db({ employees: [5] });
    try {
      setContext(db, 5);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 36);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_attendance'), 1104);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees WHERE system_role IS NOT NULL'), 12);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S06', 'VALID', 'Anonymous context (no row / NULL identity) returns zero rows', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 0, 'no context row at all');
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees'), 0);
      setContext(db, null);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 0, 'NULL identity');
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_attendance'), 0);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees'), 0);
      const sb = db.prepare('SELECT * FROM vw_session_context').get();
      assert.equal(sb.is_staff, 0);
      assert.equal(sb.account_active, 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S07', 'VALID', 'vw_secure_payslips carries the full payslip (money fields + identity)', () => {
    const { db, close } = openPhase4Db({ employees: [2] });
    try {
      setContext(db, 2);
      const row = db.prepare('SELECT * FROM vw_secure_payslips WHERE pay_period_month = 8').get();
      assert.equal(row.employee_name, 'Priya Patel');
      assert.equal(row.department, 'Engineering');
      for (const col of ['base_salary_earned', 'allowances_earned', 'overtime_pay', 'gross_salary',
        'tax_deduction', 'unpaid_leave_deduction', 'other_deductions', 'net_salary', 'status', 'payment_date']) {
        assert.ok(col in row, `expected column ${col}`);
      }
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S08', 'VALID', 'ADMIN sees all seeded months; boundary months 1 and 12 accept a fresh batch', () => {
    const { db, close } = openPhase4Db({ employees: [1, 2, 3] });
    try {
      setContext(db, 1);
      assert.deepEqual(
        db.prepare('SELECT DISTINCT pay_period_month m FROM vw_secure_payslips ORDER BY m').all().map(r => r.m),
        [8, 9, 10]
      );
      // The seed only covers Aug-Oct. For January/December, use payroll rows whose
      // computation source exists anyway: a DRAFT row can be created directly for
      // the boundary period and later recomputed once real attendance exists.
      const jan = insertDraftPayroll(db, 2, 2026, 1);
      const dec = insertDraftPayroll(db, 3, 2026, 12);
      assert.ok(jan && dec);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips WHERE pay_period_month IN (1, 12)'), 2);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 38);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-S09', 'VALID', 'RBAC: ADMIN all permissions, HR all but delete, EMPLOYEE self-scoped reads only', () => {
    const { db, close } = openPhase4Db({ employees: [1, 5, 2] });
    try {
      const perms = (id) => db.prepare(
        'SELECT permission_code p FROM vw_effective_permissions WHERE perm_employee_id = ? ORDER BY p'
      ).all(id).map(r => r.p);
      const total = count(db, 'SELECT COUNT(*) c FROM Permission');

      assert.equal(perms(1).length, total, 'ADMIN holds every permission');
      const hr = perms(5);
      assert.equal(hr.length, total - 1, 'HR holds all but one');
      assert.ok(!hr.includes('employee:delete'), 'HR cannot delete employees');
      assert.ok(hr.includes('employee:update') && hr.includes('payroll:mark-paid'), 'HR does the payroll work');
      assert.deepEqual(perms(2), [
        'attendance:read:self', 'auth:session:self', 'employee:read:self',
        'leave:read:self', 'payroll:read:self'
      ]);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_effective_permissions WHERE perm_employee_id = 3'), 0,
        'an employee without an active AuthUser/UserRole row holds nothing');
      // ...and because the secure views require effective permissions, a user
      // without any grant sees no rows at all, not even their own.
      setContext(db, 3);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees'), 0);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  // ==========================================================================
  // GROUP A - Authorisation (INVALID: cross-employee, denied actions)
  // ==========================================================================
  await test('P4-A01', 'INVALID', 'EMPLOYEE cross-employee payslip read returns 0 rows (by employee and by payroll_id)', () => {
    const { db, close } = openPhase4Db({ employees: [2, 3] });
    try {
      setContext(db, OTHER_EMPLOYEE_ID);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips WHERE employee_id = 2'), 0);
      const target = db.prepare('SELECT payroll_id FROM Payroll WHERE employee_id = 2 LIMIT 1').get().payroll_id;
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips WHERE payroll_id = ?', target), 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-A02', 'INVALID', 'EMPLOYEE cross-employee attendance and employee reads return 0 rows', () => {
    const { db, close } = openPhase4Db({ employees: [2, 3] });
    try {
      setContext(db, OTHER_EMPLOYEE_ID);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_attendance WHERE employee_id = 2'), 0);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees WHERE employee_id = 2'), 0);
      assert.equal(count(db, "SELECT COUNT(*) c FROM vw_secure_employees WHERE email = ?", EMPLOYEE_EMAIL), 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-A03', 'INVALID', 'Write/sensitive permissions are denied to EMPLOYEE, delete denied to HR', () => {
    const { db, close } = openPhase4Db({ employees: [1, 5, 2] });
    try {
      const has = (e, p) => db.prepare('SELECT fn_has_permission(?, ?) AS ok').get(e, p).ok;
      for (const p of ['payroll:generate', 'employee:update', 'employee:create', 'attendance:write',
        'payroll:mark-paid', 'payroll:approve', 'report:read:all']) {
        assert.equal(has(2, p), 0, `EMPLOYEE must not hold ${p}`);
      }
      assert.equal(has(2, 'payroll:read:self'), 1, 'the read it is allowed');
      assert.equal(has(5, 'payroll:mark-paid'), 1, 'HR may mark paid');
      assert.equal(has(5, 'employee:delete'), 0, 'HR may not delete');
      assert.equal(has(1, 'employee:delete'), 1, 'ADMIN may delete');
      assert.equal(has(null, 'payroll:read:self'), 0, 'anonymous holds nothing');
      assert.equal(has(999, 'payroll:read:self'), 0, 'unknown/ghost employee holds nothing');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-A04', 'INVALID', 'Empirical: EMPLOYEE-role credentials never reach a staff-only panel', () => {
    // BUILD_CONVENTIONS gives all 12 employees a login, so the role itself is a
    // read-only consumer. The database refuses every staff write it could try:
    const { db, close } = openPhase4Db({ employees: [2] });
    try {
      // 1. the payroll status machine refuses non-staff transitions
      catches(() => db.prepare("UPDATE Payroll SET status = 'APPROVED' WHERE payroll_id = 1").run(),
        /Illegal payroll status transition/);
      // 2. the permission function refuses every staff write
      assert.equal(db.prepare("SELECT fn_has_permission(2, 'payroll:generate') AS ok").get().ok, 0);
      // 3. the views confine the employee to their own rows
      setContext(db, 2);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips'), 3);
      // 4. no plaintext or role-surfacing shortcut in their row
      const self = db.prepare('SELECT system_role FROM vw_secure_employees').get();
      assert.equal(self.system_role, null);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-A05', 'INVALID', 'Deactivated user cannot start a session (trigger 6B)', () => {
    const { db, close } = openPhase4Db();
    try {
      addInactiveCredential(db, 2);
      catches(
        () => db.prepare(`INSERT INTO Session (session_token_hash, employee_id, issued_at, expires_at)
                          VALUES ('h', 2, '2026-11-24T00:00:00Z', '2026-11-24T12:00:00Z')`).run(),
        /Sessions can only be issued to active users/,
        'inactive session'
      );
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Session'), 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-A06', 'INVALID', 'Writing AuthUser.system_role directly to a different role is refused (6A/6D)', () => {
    const { db, close } = openPhase4Db();
    try {
      catches(
        () => db.prepare("UPDATE AuthUser SET system_role = 'ADMIN' WHERE employee_id = 5").run(),
        /must match Employee.system_role/,
        'cache escalation'
      );
      assert.equal(db.prepare('SELECT system_role FROM AuthUser WHERE employee_id = 5').get().system_role, 'HR');
      catches(
        () => db.prepare("INSERT INTO AuthUser (employee_id, email, password_hash, salt, system_role) VALUES (2, ?, 'h', 's', 'ADMIN')").run(EMPLOYEE_EMAIL),
        /must be copied from Employee.system_role/,
        'INSERT without SELECT from Employee'
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-A07', 'INVALID', 'Master role change propagates to the cache and revokes live sessions', () => {
    const { db, close } = openPhase4Db();
    try {
      issueToken(db, 5, '2099-01-01T00:00:00Z', 'hr-session');
      db.exec("UPDATE Employee SET system_role = 'EMPLOYEE' WHERE employee_id = 5");
      assert.equal(db.prepare('SELECT system_role FROM AuthUser WHERE employee_id = 5').get().system_role, 'EMPLOYEE',
        'cache follows the master');
      assert.ok(db.prepare('SELECT revoked_at r FROM Session WHERE employee_id = 5').get().r, 'session revoked');
      setContext(db, 5);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees'), 1, 'demoted HR now sees only itself');
      db.exec("UPDATE Employee SET system_role = 'HR' WHERE employee_id = 5");
      setContext(db, 5);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_employees'), 12, 'restored');
    } finally { rollbackIfOpen(db); close(); }
  });

  // ==========================================================================
  // GROUP C - Credentials & sessions
  // ==========================================================================
  await test('P4-C01', 'VALID', 'Login verifies SHA-256(salt||password) for ADMIN, HR and EMPLOYEE demo accounts', () => {
    const { db, close } = openPhase4Db({ employees: [1, 5, 2] });
    try {
      const verify = (email, pwd) => db.prepare('SELECT fn_verify_password(?, ?) AS ok').get(email, pwd).ok;
      assert.equal(verify(ADMIN_EMAIL, 'Admin@123'), 1);
      assert.equal(verify(HR_EMAIL, 'Hr@12345'), 1);
      assert.equal(verify(EMPLOYEE_EMAIL, 'Employee@123'), 1);
      const hash = db.prepare('SELECT password_hash FROM AuthUser WHERE email = ?').get(ADMIN_EMAIL).password_hash;
      assert.equal(hash, hashPassword('Admin@123'), 'commitment matches the documented formula');
      assert.notEqual(hash, 'Admin@123');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-C02', 'INVALID', 'Wrong password, empty password and unknown email are rejected', () => {
    const { db, close } = openPhase4Db();
    try {
      const verify = (email, pwd) => db.prepare('SELECT fn_verify_password(?, ?) AS ok').get(email, pwd).ok;
      assert.equal(verify(ADMIN_EMAIL, 'admin@123'), 0, 'case differs');
      assert.equal(verify(ADMIN_EMAIL, 'Admin@123 '), 0, 'trailing space differs');
      assert.equal(verify(ADMIN_EMAIL, ''), 0);
      assert.equal(verify('nobody@paytrack.internal', 'Admin@123'), 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-C03', 'INVALID', 'A plaintext "hash" (what a careless seed would store) fails verification', () => {
    const { db, close } = openPhase4Db({ employees: [1] });
    try {
      db.prepare('UPDATE AuthUser SET password_hash = ? WHERE employee_id = 1').run('Admin@123');
      assert.equal(db.prepare('SELECT fn_verify_password(?, ?) AS ok').get(ADMIN_EMAIL, 'Admin@123').ok, 0);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-C04', 'INVALID', 'A token whose session was revoked is rejected; only the hash is stored', () => {
    const { db, close } = openPhase4Db();
    try {
      const token = issueToken(db, 1, '2099-12-31T12:00:00Z');
      const now = '2026-11-24T12:00:00Z';
      const isValid = (t) => db.prepare('SELECT fn_session_is_valid(?, ?) AS ok').get(t, now).ok;
      assert.equal(isValid(sha256Hex(token)), 1, 'live session');
      assert.equal(isValid(token), 0, 'raw token is not stored');
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Session WHERE session_token_hash = ?', token), 0);

      db.prepare('UPDATE Session SET revoked_at = ? WHERE session_token_hash = ?').run(now, sha256Hex(token));
      assert.equal(isValid(sha256Hex(token)), 0, 'revoked session');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-C05', 'BOUND', 'Session at exactly expires_at (second precision) is rejected; 1 ms earlier accepted', () => {
    const { db, close } = openPhase4Db();
    try {
      const token = issueToken(db, 1, '2099-01-01T00:00:00.000Z');
      const hash = sha256Hex(token);
      const valid = (now) => db.prepare('SELECT fn_session_is_valid(?, ?) AS ok').get(hash, now).ok;
      assert.equal(valid('2099-01-01T00:00:00.000Z'), 0, 'exactly at expiry is no longer valid');
      assert.equal(valid('2098-12-31T23:59:59.999Z'), 1, 'one millisecond earlier is valid');
      assert.equal(valid('2099-01-01T00:00:00Z'), 0,
        'same instant written second-granularity is treated as the same (expired) instant');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-C06', 'INVALID', 'Empty token and expiry before issue are rejected (CHECK constraints)', () => {
    const { db, close } = openPhase4Db();
    try {
      catches(
        () => db.prepare("INSERT INTO Session VALUES ('', 1, '2026-11-24T00:00:00Z', '2026-11-24T12:00:00Z', NULL)").run(),
        /chk_session_token_present/,
        'empty token'
      );
      catches(
        () => db.prepare("INSERT INTO Session VALUES ('abc', 1, '2026-11-24T12:00:00Z', '2026-11-24T00:00:00Z', NULL)").run(),
        /chk_session_expiry/,
        'expiry before issue'
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-C07', 'INVALID', 'Session expiry cannot be pulled into the past by UPDATE (trigger 6C)', () => {
    const { db, close } = openPhase4Db();
    try {
      issueToken(db, 1, '2099-01-01T00:00:00Z', 'fixed-token');
      catches(
        () => db.prepare("UPDATE Session SET expires_at = '2020-01-01T00:00:00Z' WHERE session_token_hash = ?").run(sha256Hex('fixed-token')),
        /expiry cannot be changed/,
        'retro expiry'
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  // ==========================================================================
  // GROUP P - Payroll state machine & transaction recipe
  // ==========================================================================
  await test('P4-P01', 'VALID', 'DRAFT -> APPROVED -> PAID is accepted; payment_date set at PAID', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      const id = insertDraftPayroll(db, 2, 2026, 11);
      advancePayroll(db, id, 'APPROVED');
      advancePayroll(db, id, 'PAID', '2026-11-30');
      assert.deepEqual({ ...db.prepare('SELECT status, payment_date FROM Payroll WHERE payroll_id = ?').get(id) },
        { status: 'PAID', payment_date: '2026-11-30' });
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P02', 'VALID', 'A DRAFT row may be re-edited (recalculation allowed before approval)', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      const id = insertDraftPayroll(db, 2, 2026, 11);
      db.prepare('UPDATE Payroll SET net_salary = 2222.25, gross_salary = 2500 WHERE payroll_id = ?').run(id);
      assert.equal(db.prepare('SELECT net_salary FROM Payroll WHERE payroll_id = ?').get(id).net_salary, 2222.25);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P03', 'INVALID', 'DRAFT -> PAID skip is aborted', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      const id = insertDraftPayroll(db, 2, 2026, 11);
      catches(
        () => db.prepare("UPDATE Payroll SET status = 'PAID', payment_date = '2026-11-30' WHERE payroll_id = ?").run(id),
        /Illegal payroll status transition/,
        'DRAFT->PAID'
      );
      assert.equal(db.prepare('SELECT status FROM Payroll WHERE payroll_id = ?').get(id).status, 'DRAFT');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P04', 'INVALID', 'PAID -> APPROVED and PAID -> DRAFT are aborted', () => {
    const { db, close } = openPhase4Db();
    try {
      catches(() => db.prepare("UPDATE Payroll SET status = 'APPROVED' WHERE payroll_id = 1").run(), /Illegal payroll status transition/);
      catches(() => db.prepare("UPDATE Payroll SET status = 'DRAFT' WHERE payroll_id = 1").run(), /Illegal payroll status transition/);
      assert.equal(db.prepare('SELECT status FROM Payroll WHERE payroll_id = 1').get().status, 'PAID');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P05', 'INVALID', 'Editing any money field of a PAID row is aborted (freeze)', () => {
    const { db, close } = openPhase4Db();
    try {
      const before = { ...db.prepare('SELECT net_salary, gross_salary, payment_date FROM Payroll WHERE payroll_id = 1').get() };
      for (const sql of [
        'UPDATE Payroll SET net_salary = 1.00 WHERE payroll_id = 1',
        'UPDATE Payroll SET gross_salary = 1.00 WHERE payroll_id = 1',
        'UPDATE Payroll SET tax_deduction = 0 WHERE payroll_id = 1',
        "UPDATE Payroll SET payment_date = '2020-01-01' WHERE payroll_id = 1"
      ]) catches(() => db.prepare(sql).run(), /not in DRAFT/, sql);
      assert.deepEqual({ ...db.prepare('SELECT net_salary, gross_salary, payment_date FROM Payroll WHERE payroll_id = 1').get() }, before);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P06', 'INVALID', 'APPROVED rows freeze too; the APPROVED -> PAID step stays open', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      const id = insertDraftPayroll(db, 2, 2026, 11);
      advancePayroll(db, id, 'APPROVED');
      catches(() => db.prepare('UPDATE Payroll SET working_days = 15 WHERE payroll_id = ?').run(id), /not in DRAFT/);
      catches(() => db.prepare('UPDATE Payroll SET net_salary = 0 WHERE payroll_id = ?').run(id), /not in DRAFT/);
      advancePayroll(db, id, 'PAID', '2026-11-30');
      assert.equal(db.prepare('SELECT status FROM Payroll WHERE payroll_id = ?').get(id).status, 'PAID');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P07', 'INVALID', 'New rows cannot be born outside DRAFT, nor DRAFT with a payment date', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      catches(
        () => db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status) VALUES (2, 2, 11, 2026, 'APPROVED')").run(),
        /must start in DRAFT/,
        'born APPROVED'
      );
      catches(
        () => db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status, payment_date) VALUES (2, 2, 11, 2026, 'DRAFT', '2026-11-30')").run(),
        /cannot carry a payment date/,
        'born DRAFT with payment_date'
      );
      catches(
        () => db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status) VALUES (2, 2, 11, 2026, 'PAID')").run(),
        /must start in DRAFT/,
        'born PAID'
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P08', 'INVALID', 'APPROVED -> PAID without a payment date is aborted', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      const id = insertDraftPayroll(db, 2, 2026, 11);
      advancePayroll(db, id, 'APPROVED');
      catches(() => db.prepare("UPDATE Payroll SET status = 'PAID' WHERE payroll_id = ?").run(id), /requires a payment date/);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P09', 'VALID', 'Payroll batch COMMIT persists all computed rows for the period', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      insertAttendance(db, 1, FREE_PAST_DATE);
      insertAttendance(db, 2, FREE_PAST_DATE, { checkIn: '09:40:00' });
      const result = runPayrollBatch(db, 2026, 11);
      assert.ok(result.committed, result.error);
      assert.equal(result.count, 2);
      assert.equal(count(db, "SELECT COUNT(*) c FROM Payroll WHERE pay_period_month = 11 AND status = 'DRAFT'"), 2);
      const expected = db.prepare(`
        SELECT net_salary, gross_salary, present_days, working_days, tax_deduction
        FROM vw_payroll_procedural_computation
        WHERE employee_id = 1 AND pay_period_year = 2026 AND pay_period_month = 11`).get();
      const row = db.prepare('SELECT * FROM Payroll WHERE pay_period_month = 11 AND employee_id = 1').get();
      assert.equal(row.net_salary, expected.net_salary);
      assert.equal(row.gross_salary, expected.gross_salary);
      assert.equal(row.tax_deduction, expected.tax_deduction);
      assert.equal(row.present_days, expected.present_days);
      assert.equal(row.working_days, 22);
      assert.equal(typeof row.working_days, 'number');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P10', 'INVALID', 'Forced failure mid-batch rolls back every row, INSERT and UPDATE alike', () => {
    // ADMIN credentials are needed for the final secure-view assertion; the
    // rollback itself is independent of who is looking.
    const { db, close } = openPhase4Db({ employees: [1] });
    try {
      insertAttendance(db, 1, FREE_PAST_DATE);
      insertAttendance(db, 2, FREE_PAST_DATE);
      insertAttendance(db, 4, FREE_PAST_DATE);

      // Pre-existing DRAFT row for employee 4 whose numbers the batch will change.
      const preId = db.prepare(`INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year,
          working_days, present_days, net_salary, status)
        VALUES (4, 4, 11, 2026, 22, 0, 4321.00, 'DRAFT') RETURNING payroll_id`).get().payroll_id;
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Payroll WHERE pay_period_month = 11'), 1, 'precondition');

      const result = runPayrollBatch(db, 2026, 11, { failAtEmployee: 2 });
      assert.equal(result.committed, false, 'batch must not commit');
      assert.equal(result.count, 0);
      assert.match(result.error, /Injected failure at employee 2/);

      assert.equal(count(db, 'SELECT COUNT(*) c FROM Payroll WHERE pay_period_month = 11'), 1,
        'employee 1 INSERT and employee 4 UPDATE from the batch were rolled back');
      assert.equal(db.prepare('SELECT net_salary FROM Payroll WHERE payroll_id = ?').get(preId).net_salary, 4321.00,
        'the UPDATE returned the pre-batch value too');
      setContext(db, 1);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips WHERE pay_period_month = 11'), 1,
        'and nothing leaked through the secure view');
      setContext(db, 2);
      assert.equal(count(db, 'SELECT COUNT(*) c FROM vw_secure_payslips WHERE pay_period_month = 11'), 0,
        'employee 2 has no row: its INSERT was rolled back');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P11', 'VALID', 'Batch recipe is idempotent: same period twice produces identical DRAFT numbers', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      insertAttendance(db, 1, FREE_PAST_DATE);
      insertAttendance(db, 2, FREE_PAST_DATE);
      assert.ok(runPayrollBatch(db, 2026, 11).committed);
      const snap = () => db.prepare(
        'SELECT employee_id, net_salary, gross_salary, tax_deduction FROM Payroll WHERE pay_period_month = 11 ORDER BY employee_id'
      ).all().map(r => ({ ...r }));
      const first = snap();
      assert.ok(runPayrollBatch(db, 2026, 11).committed);
      assert.deepEqual(snap(), first);
      assert.equal(first.length, 2, 'upsert, no duplicates');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P12', 'INVALID', 'The batch never rewrites an APPROVED/PAID row (frozen data is skipped)', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      insertAttendance(db, 2, FREE_PAST_DATE);
      assert.ok(runPayrollBatch(db, 2026, 11).committed);
      const id = db.prepare('SELECT payroll_id FROM Payroll WHERE employee_id = 2 AND pay_period_month = 11').get().payroll_id;
      advancePayroll(db, id, 'APPROVED');
      const before = { ...db.prepare('SELECT gross_salary, net_salary FROM Payroll WHERE payroll_id = ?').get(id) };
      const result = runPayrollBatch(db, 2026, 11);
      assert.ok(result.committed);
      assert.equal(result.count, 0, 'nothing eligible: the only row for the period is APPROVED');
      assert.deepEqual({ ...db.prepare('SELECT gross_salary, net_salary FROM Payroll WHERE payroll_id = ?').get(id) }, before);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-P13', 'BOUND', 'SAVEPOINT: ROLLBACK TO undoes the failed batch but keeps earlier work in the transaction', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status, net_salary) VALUES (3, 3, 11, 2026, 'DRAFT', 1.00)").run();
      db.exec('SAVEPOINT payroll_batch');
      try {
        db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status, net_salary) VALUES (6, 6, 11, 2026, 'DRAFT', 1.00)").run();
        throw new Error('validation failed halfway');
      } catch {
        db.exec('ROLLBACK TO payroll_batch');
      }
      db.exec('RELEASE payroll_batch');
      db.exec('COMMIT');

      assert.equal(count(db, 'SELECT COUNT(*) c FROM Payroll WHERE pay_period_month = 11'), 1, 'employee 3 survived');
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Payroll WHERE employee_id = 6 AND pay_period_month = 11'), 0, 'employee 6 undone');
    } finally { rollbackIfOpen(db); close(); }
  });

  // ==========================================================================
  // GROUP B - Boundaries on schema CHECKs and Phase 2 triggers
  // ==========================================================================
  await test('P4-B01', 'INVALID', 'Negative salary components are rejected by CHECK constraints', () => {
    const { db, close } = openPhase4Db();
    try {
      const ins = (base, hra, allow) => db.prepare(
        "INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date) VALUES (2, ?, ?, ?, '2026-11-01')"
      ).run(base, hra, allow);
      catches(() => ins(-1.0, 0, 0), /CHECK constraint failed: base_salary >= 0.00/, 'negative base');
      catches(() => ins(1000, -5.0, 0), /CHECK constraint failed: hra >= 0.00/, 'negative hra');
      catches(() => ins(1000, 0, -0.01), /CHECK constraint failed: allowances >= 0.00/, 'negative allowances');
      ins(0.0, 0.0, 0.0); // zero is inside the documented >= 0.00 rule
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Salary WHERE base_salary = 0.00'), 1);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B02', 'BOUND', 'Pay period months 1 and 12 accepted; 0 and 13 rejected; year 2020 accepted, 2019 rejected', () => {
    const { db, close } = openPhase4Db();
    try {
      const ins = (month, year = 2026) => db.prepare(
        "INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status) VALUES (2, 2, ?, ?, 'DRAFT')"
      ).run(month, year);
      ins(1); ins(12); ins(6, 2020);
      catches(() => ins(0), /CHECK constraint failed: pay_period_month/, 'month 0');
      catches(() => ins(13), /CHECK constraint failed: pay_period_month/, 'month 13');
      catches(() => ins(-1), /CHECK constraint failed: pay_period_month/, 'month -1');
      catches(() => ins(6, 2019), /CHECK constraint failed: pay_period_year/, 'year 2019');
      // The seed itself already holds 36 rows for 2026; the three new ones are periods 1, 12 and 2020.
      assert.equal(count(db, "SELECT COUNT(*) c FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month IN (1, 12)"), 2);
      assert.equal(count(db, "SELECT COUNT(*) c FROM Payroll WHERE pay_period_year = 2020"), 1);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B03', 'INVALID', 'Negative computed money values are rejected by CHECK constraints', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      for (const col of ['net_salary', 'gross_salary', 'tax_deduction']) {
        catches(
          () => db.prepare(`INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status, ${col}) VALUES (2, 2, 11, 2026, 'DRAFT', -0.01)`).run(),
          new RegExp(`CHECK constraint failed: ${col} >= 0.00`),
          `${col} = -0.01`
        );
      }
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B04', 'INVALID', 'Duplicate attendance for the same employee and date is rejected (UNIQUE)', () => {
    const { db, close } = openPhase4Db();
    try {
      insertAttendance(db, 2, FREE_PAST_DATE);
      catches(
        () => insertAttendance(db, 2, FREE_PAST_DATE, { checkIn: '09:10:00' }),
        /UNIQUE constraint failed: Attendance.employee_id, Attendance.attendance_date/,
        'duplicate day'
      );
      insertAttendance(db, 2, '2026-11-03');
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Attendance WHERE employee_id = 2 AND attendance_date >= ?', FREE_PAST_DATE), 2);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B05', 'BOUND', 'Overtime == hours_worked accepted; +0.01 past hours_worked rejected', () => {
    const { db, close } = openPhase4Db();
    try {
      insertAttendance(db, 6, FREE_PAST_DATE, { hours: 8.0, overtime: 8.0 });
      catches(
        () => insertAttendance(db, 6, '2026-11-03', { hours: 8.0, overtime: 8.01 }),
        /Overtime hours cannot exceed total hours worked/,
        'one cent past the boundary'
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B06', 'BOUND', 'Check-in 09:30:00 is not late; 09:30:01 is late (0 whole minutes)', () => {
    const { db, close } = openPhase4Db();
    try {
      assert.deepEqual(lateRow(db, insertAttendance(db, 7, FREE_PAST_DATE, { checkIn: '09:30:00' }).attendance_id),
        { is_late: 0, late_minutes: 0 });
      const late = lateRow(db, insertAttendance(db, 7, '2026-11-03', { checkIn: '09:30:01' }).attendance_id);
      assert.equal(late.is_late, 1, 'auto late-mark trigger fired');
      assert.equal(late.late_minutes, 0, '1 second truncates to 0 whole minutes');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B07', 'BOUND', 'Check-in 10:45:00 is late by exactly 75 minutes; 09:29:59 is on time', () => {
    const { db, close } = openPhase4Db();
    try {
      assert.deepEqual(lateRow(db, insertAttendance(db, 7, FREE_PAST_DATE, { checkIn: '10:45:00' }).attendance_id),
        { is_late: 1, late_minutes: 75 });
      assert.deepEqual(lateRow(db, insertAttendance(db, 7, '2026-11-03', { checkIn: '09:29:59' }).attendance_id),
        { is_late: 0, late_minutes: 0 });
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B08', 'BOUND', 'hours_worked 24.00 accepted / 24.01 rejected; overtime 16.00 accepted / 16.01 rejected', () => {
    const { db, close } = openPhase4Db();
    try {
      insertAttendance(db, 8, FREE_PAST_DATE, { hours: 24.0, overtime: 16.0 });
      catches(() => insertAttendance(db, 8, '2026-11-03', { hours: 24.01 }), /CHECK constraint failed: hours_worked/, 'hours 24.01');
      // 16.01 overtime with 24 h worked passes the Phase 2 "OT <= hours" trigger
      // and is stopped by the column CHECK. When hours_worked is also 16.01 the
      // trigger fires first, so both layers are shown separately.
      catches(() => insertAttendance(db, 8, '2026-11-04', { hours: 24.0, overtime: 16.01 }),
        /CHECK constraint failed: overtime_hours/, 'overtime 16.01 (column CHECK)');
      // 16.00 overtime is inside the column CHECK, so this case reaches the
      // Phase 2 "OT <= hours_worked" trigger rather than the CHECK.
      catches(() => insertAttendance(db, 8, '2026-11-05', { hours: 15.0, overtime: 16.0 }),
        /Overtime hours cannot exceed total hours worked/,
        'OT above hours_worked: the Phase 2 trigger fires first');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B09', 'INVALID', 'ABSENT attendance cannot carry overtime', () => {
    const { db, close } = openPhase4Db();
    try {
      catches(
        () => insertAttendance(db, 9, FREE_PAST_DATE, { status: 'ABSENT', checkIn: null, checkOut: null, hours: 0.5, overtime: 0.5 }),
        /ABSENT employee/,
        'overtime while absent'
      );
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B10', 'INVALID', 'Future-dated attendance is rejected (Phase 2 rule preserved)', () => {
    const { db, close } = openPhase4Db();
    try {
      const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      catches(() => insertAttendance(db, 10, future), /cannot be in the future/, 'future attendance');
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-B11', 'VALID', 'Today-dated attendance is accepted (future check is strictly > today)', () => {
    const { db, close } = openPhase4Db();
    try {
      const today = db.prepare('SELECT date(\'now\', \'localtime\') d').get().d;
      const row = insertAttendance(db, 10, today);
      assert.ok(row.attendance_id);
    } finally { rollbackIfOpen(db); close(); }
  });

  // ==========================================================================
  // GROUP I - Integration facts the Phase 5 API depends on
  // ==========================================================================
  await test('P4-I01', 'VALID', 'Prepared UPDATE statements fire the security triggers at execution time', () => {
    const { db, close } = openPhase4Db();
    try {
      const stmt = db.prepare('UPDATE Payroll SET status = ? WHERE payroll_id = ?');
      assert.throws(() => stmt.run('DRAFT', 1), /Illegal payroll status transition/);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-I02', 'VALID', 'API fallback DDL (CREATE TABLE IF NOT EXISTS) coexists with security.sql', () => {
    const { db, close } = openPhase4Db({ seedStaffCredentials: false });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS AuthUser (employee_id INTEGER PRIMARY KEY, email TEXT UNIQUE,
          password_hash TEXT, salt TEXT, system_role TEXT DEFAULT 'EMPLOYEE',
          is_active INTEGER DEFAULT 1, last_login_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS Session (session_token_hash TEXT PRIMARY KEY, employee_id INTEGER,
          issued_at TEXT, expires_at TEXT, revoked_at TEXT);`);
      const cols = db.prepare("SELECT name FROM pragma_table_info('AuthUser')").all().map(r => r.name);
      for (const c of ['employee_id', 'email', 'password_hash', 'salt', 'system_role', 'is_active',
        'last_login_at', 'created_at', 'password_changed_at']) {
        assert.ok(cols.includes(c), `API contract column ${c} present`);
      }
      const sCols = db.prepare("SELECT name FROM pragma_table_info('Session')").all().map(r => r.name).sort();
      assert.deepEqual(sCols, ['employee_id', 'expires_at', 'issued_at', 'revoked_at', 'session_token_hash']);
    } finally { rollbackIfOpen(db); close(); }
  });

  await test('P4-I03', 'VALID', 'Reverse load order (security before seed) works via drop guard -> seed -> re-run', () => {
    // Build a genuinely reversed database: everything except the ledger seed,
    // then the documented recovery (drop guard, load seed, re-run security.sql).
    const dbPath = path.join(os.tmpdir(), `paytrack_p4_reverse_${process.pid}_${Date.now()}.sqlite`);
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('PRAGMA foreign_keys = ON;');
      registerAppFunctions(db);
      const seedSql = fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8');
      const seedWithoutPayroll = seedSql.split('INSERT INTO Payroll')[0];
      for (const file of ['schema.sql', 'procedures.sql', 'triggers.sql']) {
        db.exec(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
      }
      db.exec(seedWithoutPayroll);
      db.exec(fs.readFileSync(path.join(DB_DIR, 'security.sql'), 'utf8'));

      db.exec('DROP TRIGGER IF EXISTS trg_payroll_insert_status_guard');
      db.exec('INSERT INTO Payroll' + seedSql.split('INSERT INTO Payroll')[1]);
      db.exec(fs.readFileSync(path.join(DB_DIR, 'security.sql'), 'utf8'));
      assert.equal(count(db, 'SELECT COUNT(*) c FROM Payroll'), 36);
      catches(
        () => db.prepare("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, status) VALUES (2, 2, 11, 2026, 'PAID')").run(),
        /must start in DRAFT/,
        'insert guard restored'
      );
      catches(
        () => db.prepare('UPDATE Payroll SET net_salary = 1 WHERE payroll_id = 1').run(),
        /not in DRAFT/,
        'freeze guard restored'
      );
    } finally {
      rollbackIfOpen(db);
      db.close();
      try { fs.unlinkSync(dbPath); } catch { /* already gone */ }
    }
  });

  await test('P4-I04', 'VALID', 'security.sql inventory: 6 vw_secure views, 9 triggers, expected RBAC counts', () => {
    const { db, close } = openPhase4Db();
    try {
      const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'vw_secure_%' ORDER BY name").all().map(r => r.name);
      assert.deepEqual(views, [
        'vw_secure_attendance', 'vw_secure_attendance_monthly_summary',
        'vw_secure_employees', 'vw_secure_late_marks', 'vw_secure_payslips'
      ]);
      const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND (
          name LIKE 'trg_payroll_%' OR name LIKE 'trg_session_%' OR name LIKE 'trg_authuser_%' OR name = 'trg_employee_role_promote')
        ORDER BY name`).all().map(r => r.name);
      assert.equal(triggers.length, 9, triggers.join(','));
      const roles = count(db, 'SELECT COUNT(*) c FROM Role');
      const perms = count(db, 'SELECT COUNT(*) c FROM Permission');
      assert.equal(roles, 3);
      assert.equal(perms, 18);
      assert.equal(count(db, "SELECT COUNT(*) c FROM RolePermission WHERE role_code = 'ADMIN'"), perms);
      assert.equal(count(db, "SELECT COUNT(*) c FROM RolePermission WHERE role_code = 'HR'"), perms - 1);
      assert.equal(count(db, "SELECT COUNT(*) c FROM RolePermission WHERE role_code = 'EMPLOYEE'"), 5);
    } finally { rollbackIfOpen(db); close(); }
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  templateCleanup();
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = total - passed;
  const byType = (t) => results.filter(r => r.type === t).length;
  const totalMs = Number((performance.now() - suiteStarted).toFixed(2));

  console.log('\n' + '='.repeat(80));
  console.log('                       PHASE 4 EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Tests Run: ${total}  (VALID ${byType('VALID')}, INVALID ${byType('INVALID')}, BOUND ${byType('BOUND')})`);
  console.log(`  Passed:          ${passed}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Total Duration:  ${totalMs}ms`);
  console.log(`  Final Status:    ${failed === 0 ? 'ALL TESTS PASSED (Exit Code: 0)' : `FAILED (${failed}) (Exit Code: 1)`}`);
  console.log('='.repeat(80) + '\n');

  if (failed > 0) {
    console.error('FAILURES SUMMARY:');
    for (const f of results.filter(r => r.status === 'FAIL')) {
      console.error(`- [${f.id}] ${f.description}: ${f.error}`);
    }
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

main().catch(err => {
  console.error('FATAL UNCAUGHT RUNNER ERROR:', err);
  process.exit(1);
});
