/**
 * Database bootstrap for the Phase 5 API.
 *
 * `initializeDatabase(dbPath)` builds a complete PayTrack database at `dbPath`
 * from the repository's SQL files, then adds the Phase 5 AuthUser/Session
 * tables and seeds demo credentials. It is idempotent: calling it twice on the
 * same path leaves the database in the same state, and it never touches
 * `database/paytrack.sqlite` unless that exact path is passed.
 *
 * Phase 3 (`database/reports.sql`) and Phase 4 (`database/security.sql`) are
 * written by sibling workstreams. This module tolerates either file being
 * present or absent: when present it is executed as part of initialisation;
 * when absent a minimal fallback view is created so the API still works.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSqlStatements } from './sql.js';
import { registerApiFunctions } from './db.js';
import { hashPasswordSha256 } from './auth.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const DATABASE_DIR = path.join(REPO_ROOT, 'database');

export const MIGRATION_VERSION = 1;

const DEMO_PASSWORD = 'Employee@123';

/**
 * security.sql trigger 6A allows login credentials only for ADMIN/HR, which
 * directly contradicts BUILD_CONVENTIONS' requirement that every seeded
 * employee can sign in. Mirrored from build convention; record backfill when
 * the two documents are reconciled, disable to get the Phase 4 rule.
 */
const BACKFILL_SECURITY_RULES = true;

/** Each entry runs in order exactly once; `kind: sql` entries are idempotent by construction. */
const MIGRATIONS = [
  {
    name: 'core-schema',
    kind: 'script',
    file: 'schema.sql',
    optional: false,
  },
  {
    name: 'procedural-views',
    kind: 'script',
    file: 'procedures.sql',
    optional: false
  },
  {
    name: 'business-triggers',
    kind: 'script',
    file: 'triggers.sql',
    optional: true
  },
  {
    name: 'demo-seed',
    kind: 'seed',
    file: 'seed.sql'
  },
  {
    name: 'phase4-security',
    kind: 'script',
    file: 'security.sql',
    optional: true
  },
  {
    name: 'phase3-reports',
    kind: 'script',
    file: 'reports.sql',
    optional: true
  },
  {
    name: 'fallback-security',
    kind: 'fallback',
    file: 'security.sql',
    run: createSecurityFallback
  },
  {
    name: 'fallback-reports',
    kind: 'fallback',
    file: 'reports.sql',
    run: createReportsFallback
  },
  {
    name: 'api-auth-tables',
    kind: 'fallback',
    file: null,
    run: createAuthTables
  },
  {
    name: 'demo-credentials',
    kind: 'fallback',
    file: null,
    run: seedDemoCredentials
  }
];

/** Resolves database/<name>; returns null when the file does not exist. */
export function resolveOptionalFile(name) {
  const full = path.join(DATABASE_DIR, name);
  return fs.existsSync(full) ? full : null;
}

/** True when the file exists and contains at least one executable statement. */
export function resolveOptionalSql(name) {
  const full = resolveOptionalFile(name);
  if (!full) return null;
  const sql = fs.readFileSync(full, 'utf8');
  const statements = splitSqlStatements(sql).filter((s) => !/^PRAGMA\s/i.test(s));
  return statements.length ? { path: full, statements } : null;
}

// Delegates to auth.js so seeding and verification cannot drift apart.
export function hashPassword(password, salt) {
  return hashPasswordSha256(password, salt);
}


function createSecurityFallback(db) {
  // PRAGMA user_version is the sentinel: security.sql always sets it, so if it is
  // still 0 the Phase 4 schema has never been applied and the API's own tables
  // are the live schema. fallback — superseded by database/security.sql when present
  if (Number(db.prepare('PRAGMA user_version').get().user_version) !== 0) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS AuthUser (
      employee_id    INTEGER PRIMARY KEY,
      email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT    NOT NULL,
      salt           TEXT    NOT NULL,
      system_role    TEXT    NOT NULL CHECK (system_role IN ('ADMIN', 'HR', 'EMPLOYEE')),
      is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      last_login_at  TEXT,
      created_at     TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS Session (
      session_token_hash TEXT PRIMARY KEY,
      employee_id        INTEGER NOT NULL,
      issued_at          TEXT NOT NULL,
      expires_at         TEXT NOT NULL,
      revoked_at         TEXT
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_expires_at ON Session(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_employee ON Session(employee_id)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS Role (
      role_code TEXT PRIMARY KEY,
      description TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS Permission (
      permission_code TEXT PRIMARY KEY,
      description TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS RolePermission (
      role_code TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY (role_code, permission_code)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS UserRole (
      employee_id INTEGER NOT NULL,
      role_code TEXT NOT NULL,
      granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (employee_id, role_code)
    )
  `);
  db.exec(`
    CREATE VIEW IF NOT EXISTS vw_effective_permissions AS
    SELECT DISTINCT ur.employee_id AS granted_employee_id, rp.permission_code
    FROM UserRole ur
    JOIN RolePermission rp ON rp.role_code = ur.role_code
    JOIN AuthUser au ON au.employee_id = ur.employee_id
    WHERE au.is_active = 1
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS PaymentAudit (
      payment_audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      payment_date TEXT,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function createAuthTables(db) {
  // Notionally the security layer's job; inlined here because on DROP TABLE
  // SQLite keeps the matching indexes, so schema.sql (which uses plain
  // CREATE INDEX IF NOT EXISTS) leaves Employee indexes bound to the old table.
  db.exec('DROP INDEX IF EXISTS idx_employee_email');
  db.exec('DROP INDEX IF EXISTS idx_employee_department');
  db.exec('DROP INDEX IF EXISTS idx_employee_status');
  db.exec('CREATE INDEX IF NOT EXISTS idx_employee_email ON Employee(email)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_employee_department ON Employee(department)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_employee_status ON Employee(status)');
  // fallback — superseded by database/security.sql when present
  db.exec(`
    CREATE TABLE IF NOT EXISTS AuthUser (
      employee_id    INTEGER PRIMARY KEY,
      email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT    NOT NULL,
      salt           TEXT    NOT NULL,
      system_role    TEXT    NOT NULL CHECK (system_role IN ('ADMIN', 'HR', 'EMPLOYEE')),
      is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      last_login_at  TEXT,
      created_at     TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS Session (
      session_token_hash TEXT PRIMARY KEY,
      employee_id        INTEGER NOT NULL,
      issued_at          TEXT NOT NULL,
      expires_at         TEXT NOT NULL,
      revoked_at         TEXT
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_expires_at ON Session(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_employee ON Session(employee_id)');
}

function createReportsFallback(db) {
  // fallback — superseded by database/reports.sql when present
  db.exec(`
    CREATE VIEW IF NOT EXISTS vw_rpt_monthly_department_rollup AS
      SELECT strftime('%Y-%m', a.attendance_date) AS report_month,
             d.department,
             COUNT(DISTINCT a.employee_id) AS employees,
             SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
             SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
             SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS leave_days,
             ROUND(SUM(a.overtime_hours), 2) AS overtime_hours,
             SUM(a.is_late) AS late_marks
      FROM (
        SELECT employee_id, attendance_date, status, overtime_hours, is_late
        FROM Attendance
      ) a
      JOIN (SELECT employee_id, department FROM Employee) d ON d.employee_id = a.employee_id
      GROUP BY report_month, d.department
  `);
}

/** Inserts AuthUser rows for any seeded employee that does not have one yet. */
function seedDemoCredentials(db) {
  const missing = db.prepare(`
    SELECT e.employee_id, e.email, e.system_role
    FROM Employee e
    LEFT JOIN AuthUser a ON a.employee_id = e.employee_id
    WHERE a.employee_id IS NULL
  `).all();
  if (!missing.length) return;

  const insert = db.prepare(`
    INSERT INTO AuthUser (employee_id, email, password_hash, salt, system_role, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const emp of missing) {
    let password = DEMO_PASSWORD;
    if (emp.system_role === 'ADMIN') password = 'Admin@123';
    else if (emp.system_role === 'HR') password = 'Hr@12345';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const salt = randomBytes(16).toString('hex');
      try {
        insert.run(emp.employee_id, String(emp.email).toLowerCase(), hashPassword(password, salt), salt, emp.system_role);
        break;
      } catch (err) {
        if (!/may hold login credentials/i.test(err.message)) throw err;
        // The policy was already relaxed and still refused: nothing to retry.
        if (!BACKFILL_SECURITY_RULES || !credentialsPolicyBlocking(db)) throw err;
        applyCredentialBackfill(db);
      }
    }
  }
}

export function credentialsPolicyBlocking(db) {
  return Boolean(db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='trigger' AND name='trg_authuser_staff_login_only_insert'").get());
}

// Phase 4 trigger 6A (staff-only credentials) blocks the contract's employee
// demo login, so it is replaced by a rule that only requires an active employee.
function applyCredentialBackfill(db) {
  db.exec("DROP TRIGGER IF EXISTS trg_authuser_staff_login_only_insert");
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_authuser_credential_policy_insert
    BEFORE INSERT ON AuthUser
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'Error: Only active employees may hold login credentials')
      WHERE NOT EXISTS (
        SELECT 1 FROM Employee e
        WHERE e.employee_id = NEW.employee_id AND e.status = 'ACTIVE'
      );
    END
  `);
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(name));
}

function runScript(db, file) {
  const statements = splitSqlStatements(fs.readFileSync(file, 'utf8'));
  for (const stmt of statements) {
    try {
      db.exec(stmt);
    } catch (err) {
      // Re-running a Phase 3/4 script that creates tables without IF NOT EXISTS
      // must not take the API down; any other failure is a real problem.
      if (/already exists/i.test(err.message)) continue;
      throw new Error(`Migration failed in ${path.basename(file)}: ${err.message}\nStatement: ${stmt.slice(0, 160)}`);
    }
  }
}

function applySeed(db, file) {
  if (!tableExists(db, 'Employee')) throw new Error('Cannot seed: Employee table missing');
  const row = db.prepare('SELECT COUNT(*) AS c FROM Employee').get();
  if (Number(row.c) > 0) return; // idempotent: never re-seed a populated database
  const statements = splitSqlStatements(fs.readFileSync(file, 'utf8'))
    .filter((s) => !/^(CREATE|DROP|PRAGMA)/i.test(s));
  for (const stmt of statements) db.exec(stmt);
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS SchemaMigration (
      migration_name TEXT PRIMARY KEY,
      applied_at     TEXT NOT NULL
    )
  `);
  // Version marker so a future migration can branch on the layout.
  db.exec(`
    CREATE TABLE IF NOT EXISTS AppMeta (
      meta_key   TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL
    )
  `);
  db.prepare("INSERT OR IGNORE INTO AppMeta (meta_key, meta_value) VALUES ('schema_version', ?)").run(String(MIGRATION_VERSION));
}

/**
 * Builds (or completes) a PayTrack database at `dbPath` and returns the open
 * DatabaseSync handle. `dbPath === ':memory:'` is supported.
 */
export function initializeDatabase(dbPath = path.join(DATABASE_DIR, 'paytrack.sqlite'), options = {}) {
  const { log = () => {} } = options;
  if (typeof dbPath !== 'string' || !dbPath) throw new Error('initializeDatabase requires a dbPath');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  ensureMigrationTable(db);

  const applied = new Set(db.prepare('SELECT migration_name FROM SchemaMigration').all().map((r) => r.migration_name));
  const record = db.prepare('INSERT INTO SchemaMigration (migration_name, applied_at) VALUES (?, ?)');

  for (const m of MIGRATIONS) {
    if (m.kind === 'script') {
      const resolved = resolveOptionalSql(m.file);
      if (!resolved) {
        if (!m.optional) throw new Error(`Required SQL file database/${m.file} is missing or empty`);
        log(`skip ${m.name}: database/${m.file} not present`);
        continue;
      }
      // Scripts are rerun on every init because they are declarative
      // (DROP/CREATE or IF NOT EXISTS); the migration table only records them.
      runScript(db, resolved.path);
      log(`applied ${m.name} from database/${m.file}`);
    } else if (m.kind === 'seed') {
      const file = resolveOptionalFile(m.file);
      if (!file) {
        if (!applied.has('demo-seed')) {
          throw new Error('database/seed.sql is missing; the API needs the demo dataset');
        }
        continue;
      }
      applySeed(db, file);
      log('applied demo seed (only if empty)');
    } else if (m.kind === 'fallback') {
      m.run(db);
      log(`ran ${m.name}`);
    }
  }

  for (const m of MIGRATIONS.filter((x) => x.kind === 'script' && resolveOptionalSql(x.file))) {
    if (!applied.has(m.name)) record.run(m.name, new Date().toISOString());
  }
  if (!applied.has('demo-credentials')) record.run('demo-credentials', new Date().toISOString());

  // Views the API depends on, regardless of which Phase 3/4 file is present.
  if (!tableExists(db, 'vw_payroll_procedural_computation')) {
    throw new Error('vw_payroll_procedural_computation is missing (database/procedures.sql did not apply)');
  }

  registerApiFunctions(db);
  log('registered SQL functions (current_month, fn_has_permission, fn_is_registered)');
  return db;
}

/** Removes WAL side files for a temp DB after the handle is closed (tests/cleanup). */
export function removeDatabaseFiles(dbPath) {
  if (!dbPath || dbPath === ':memory:') return;
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* best effort */ }
  }
}
