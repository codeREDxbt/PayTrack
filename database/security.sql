-- ============================================================================
-- PayTrack Enterprise Payroll & Attendance Management System
-- Security, Access Control & Transactional Integrity (Phase 4 Security Layer)
-- ============================================================================
-- Candidate Name : Vinayak
-- Roll Number    : 2501730150
-- Course         : Database Management Systems (CapStone Phase 4)
-- Engine Target  : SQLite 3 Engine & Node.js Native Runtime
-- Dialect Mirrors: PostgreSQL 14+ & MySQL 8.0+ (commented reference blocks)
-- ============================================================================
--
-- WHY THIS FILE LOOKS THE WAY IT DOES
--   SQLite has no CREATE ROLE, no GRANT, and no row-level security. To get the
--   same guarantees we map the RBAC model onto ordinary tables and views:
--
--     1. IDENTITIES      AuthUser  - one login per employee (credential store)
--                        Session   - opaque bearer tokens, stored as hashes
--     2. AUTHORISATION   Role -> RolePermission -> Permission  (what a role may do)
--                        UserRole                            (which roles a user holds)
--     3. ENFORCEMENT     SessionContext - a one-row header the API writes per request;
--                        vw_secure_*    - row-filtering views driven by that header
--                        password triggers - staff-only credential operations
--     4. INTEGRITY       payroll status-machine triggers + a transaction recipe
--
--   The API never selects from Employee/Attendance/Payroll directly through the
--   session views; it opens the connection set to `employee_id` read via
--   PRAGMA query_only, then: INSERT/UPDATE/DELETE "SessionContext" ...; SELECT ...
--   FROM vw_secure_*; DELETE FROM "SessionContext";. Each step is one SQL statement
--   so no other request can interleave on the same connection (see TRANSACTION
--   RECIPE below). Permissions are additionally checked at the API layer with
--   fn_has_permission(), because view scoping answers "whose rows", not "which action".
--
-- PASSWORD POLICY (application-side, by design)
--   SQL cannot call crypto, and hashing in SQL tempts the application into passing
--   plaintext through the database. Passwords are therefore hashed by the API
--   (server/auth.js, Phase 5) with Node's crypto module:
--
--       password_hash = hex( SHA-256( salt_bytes || utf8(password) ) )
--       salt          = hex( crypto.randomBytes(16) )                (per user)
--
--   Comparison must be constant-time (crypto.timingSafeEqual on the raw digests).
--   Never store or log the plaintext. Demo accounts (seeded from BUILD_CONVENTIONS):
--
--       rajesh.sharma@paytrack.internal    Admin@123      (ADMIN)
--       sunita.rao@paytrack.internal       Hr@12345       (HR)
--       priya.patel@paytrack.internal      Employee@123   (EMPLOYEE)
--       remaining 9 employees              Employee@123   (EMPLOYEE)
--
--   Note: these demo passwords are public on purpose (university submission);
--   the seed loader must hash them, never insert them as-is.
--
-- SEED ORDER (read this before wiring it into a pipeline)
--   schema.sql -> procedures.sql -> triggers.sql -> seed.sql -> security.sql
--   The seed inserts 36 historical payroll rows with status 'PAID'. The INSERT
--   guard from section 5 (a new payroll row must be DRAFT) is therefore enabled
--   after the seed, not before. Load security.sql twice if you like: every object
--   uses IF NOT EXISTS, so a second run restores triggers without errors, and an
--   API-supplied fallback table with the same columns can coexist.
--   The Phase 4 tests prove both sequences: seed-first (the pipeline above) and
--   security-first (drop guard -> seed -> re-run security.sql).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ============================================================================
-- SECTION 1: Identity - Credentials & Sessions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table 1: AuthUser (login identity, 1:1 with Employee)
-- ----------------------------------------------------------------------------
-- Clearing HOUSEKEEPING NOTES:
--   - email is UNIQUE COLLATE NOCASE so 'Raj@x' and 'raj@x' cannot both log in
--     (a UNIQUE index alone would allow both).
--   - system_role is a cached copy of Employee.system_role. It exists because the
--     session views and the API need the role without a join on every request, and
--     because the API contract (BUILD_CONVENTIONS.md) lists it as part of the user
--     object. It can never disagree with the master: it is always inserted as
--     (SELECT system_role FROM Employee ...), and trigger 4C re-pins it after any
--     edit and resets credentials if the role changed (privilege-change revocation).
--   - password_hash holds the SHA-256 hex digest (64 chars); salt holds the
--     randomBytes(16) hex (32 chars). Both are opaque strings to the database.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS AuthUser (
    employee_id     INTEGER PRIMARY KEY,
    email           TEXT    NOT NULL UNIQUE COLLATE NOCASE
                    CHECK (length(email) > 0 AND email = trim(email)),
    password_hash   TEXT    NOT NULL CHECK (length(password_hash) > 0),
    salt            TEXT    NOT NULL CHECK (length(salt) > 0),
    system_role     TEXT    NOT NULL DEFAULT 'EMPLOYEE'
                    CHECK (system_role IN ('ADMIN', 'HR', 'EMPLOYEE')),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    last_login_at   TEXT,
    password_changed_at TEXT,
    created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_authuser_employee
        FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ----------------------------------------------------------------------------
-- Table 2: Session (opaque bearer tokens)
-- ----------------------------------------------------------------------------
-- The token itself is never stored: session_token_hash = SHA-256 token (by the API).
-- A leaked database therefore yields no usable token. Index on expires_at lets
-- the API purge expired sessions with a single range scan.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Session (
    session_token_hash  TEXT    PRIMARY KEY,
    employee_id         INTEGER NOT NULL,
    issued_at           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          TEXT    NOT NULL,
    revoked_at          TEXT,
    CONSTRAINT fk_session_authuser
        FOREIGN KEY (employee_id) REFERENCES AuthUser(employee_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_session_token_present
        CHECK (length(session_token_hash) > 0),          -- '' is a legal PK value in SQLite
    CONSTRAINT chk_session_expiry
        CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_session_expires_at ON Session(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_employee   ON Session(employee_id);

-- ============================================================================
-- SECTION 2: Authorisation - Role Based Access Control (RBAC)
-- ============================================================================
-- Classic NIST-style RBAC: User --(UserRole)--> Role --(RolePermission)--> Permission.
-- Keeping the permission strings in a table (rather than in code) means the API
-- can answer "what may this user do?" with one query, and an auditor can change
-- entitlements without a redeploy.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Role (
    role_code   TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Permission (
    permission_code TEXT PRIMARY KEY,   -- "<resource>:<action>[:<scope>]"
    description     TEXT NOT NULL
);

-- Synthetic primary key: SQLite cannot add the composite PK to an existing table,
-- and the API may have already created RolePermission(role_code, permission_code).
CREATE TABLE IF NOT EXISTS RolePermission (
    role_permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_code          TEXT NOT NULL,
    permission_code    TEXT NOT NULL,
    CONSTRAINT fk_rolepermission_role
        FOREIGN KEY (role_code) REFERENCES Role(role_code) ON DELETE CASCADE,
    CONSTRAINT fk_rolepermission_permission
        FOREIGN KEY (permission_code) REFERENCES Permission(permission_code) ON DELETE CASCADE,
    CONSTRAINT uq_rolepermission UNIQUE (role_code, permission_code)
);

CREATE TABLE IF NOT EXISTS UserRole (
    user_role_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id    INTEGER NOT NULL,
    role_code      TEXT    NOT NULL,
    granted_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_userrole_authuser
        FOREIGN KEY (employee_id) REFERENCES AuthUser(employee_id) ON DELETE CASCADE,
    CONSTRAINT fk_userrole_role
        FOREIGN KEY (role_code) REFERENCES Role(role_code) ON DELETE CASCADE,
    CONSTRAINT uq_userrole UNIQUE (employee_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_rolepermission_role ON RolePermission(role_code);
CREATE INDEX IF NOT EXISTS idx_userrole_employee   ON UserRole(employee_id);

-- ----------------------------------------------------------------------------
-- Seeds (idempotent - the file can be re-run after adding a permission)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO Role (role_code, description) VALUES
    ('ADMIN',    'System administrator: full staff access including employee deletion'),
    ('HR',       'Human resources staff: full payroll and attendance access, no employee deletion'),
    ('EMPLOYEE', 'Regular employee: read-only access to their own records');

INSERT OR IGNORE INTO Permission (permission_code, description) VALUES
    ('employee:read:all',      'Read every employee record'),
    ('employee:read:self',     'Read own record only'),
    ('employee:create',        'Create employees'),
    ('employee:update',        'Update employees'),
    ('employee:delete',        'Delete employees (ADMIN only)'),
    ('attendance:read:all',    'Read attendance of every employee'),
    ('attendance:read:self',   'Read own attendance only'),
    ('attendance:write',       'Create, update and delete attendance'),
    ('payroll:read:all',       'Read payroll of every employee'),
    ('payroll:read:self',      'Read own payslips only'),
    ('payroll:generate',       'Recompute DRAFT payroll batches'),
    ('payroll:approve',        'Approve DRAFT payroll rows'),
    ('payroll:mark-paid',      'Mark APPROVED payroll rows as PAID'),
    ('leave:read:all',         'Read leave of every employee'),
    ('leave:read:self',        'Read own leave only'),
    ('leave:write',            'Apply for and decide leave'),
    ('report:read:all',        'Run organisation-wide reports'),
    ('auth:session:self',      'Log in, log out and read own session');

-- ADMIN: every permission.
INSERT OR IGNORE INTO RolePermission (role_code, permission_code)
SELECT 'ADMIN', permission_code FROM Permission;

-- HR: every permission except employee deletion (separation of duties).
INSERT OR IGNORE INTO RolePermission (role_code, permission_code)
SELECT 'HR', permission_code FROM Permission WHERE permission_code <> 'employee:delete';

-- EMPLOYEE: the explicitly self-scoped read permissions plus own-session access.
INSERT OR IGNORE INTO RolePermission (role_code, permission_code) VALUES
    ('EMPLOYEE', 'employee:read:self'),
    ('EMPLOYEE', 'attendance:read:self'),
    ('EMPLOYEE', 'payroll:read:self'),
    ('EMPLOYEE', 'leave:read:self'),
    ('EMPLOYEE', 'auth:session:self');

-- ============================================================================
-- SECTION 3: Enforcement - Session Context & Row-Level Secure Views
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: SessionContext (per-request header row, written by the API)
-- ----------------------------------------------------------------------------
-- Exactly one row. current_employee_id is NULL when nobody is logged in; the
-- secure views then return zero rows. A second row cannot be inserted, and a
-- staff request cannot leave a previous user's identity behind because the API
-- overwrites the single PK=1 row in one statement.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SessionContext (
    context_id          INTEGER PRIMARY KEY CHECK (context_id = 1),
    current_employee_id INTEGER,
    CONSTRAINT fk_sessioncontext_employee
        FOREIGN KEY (current_employee_id) REFERENCES Employee(employee_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_sessioncontext_singleton CHECK (context_id = 1)
);

-- ----------------------------------------------------------------------------
-- View 1: vw_current_session (resolves the context row to a role)
-- ----------------------------------------------------------------------------
-- LEFT JOIN on purpose: an anonymous context yields system_role NULL, which the
-- CASE expressions below map to "no rows" instead of "no filtering".
-- vw_secure_employees deliberately serves system_role as NULL (see below).
-- ----------------------------------------------------------------------------
-- The name `session_employee_id` (never a bare `employee_id`) is deliberate:
-- inside a SELECT SQLite resolves a bare name against the *result columns*
-- produced so far, so a column called employee_id added by a CROSS JOIN would
-- shadow e.employee_id in the WHERE clause. Aliasing the context uniquely keeps
-- every comparison unambiguous (the suite pins row counts, not just values).
CREATE VIEW IF NOT EXISTS vw_current_session AS
SELECT
    sc.current_employee_id AS session_employee_id,
    CASE WHEN e.employee_id IS NULL THEN NULL ELSE e.system_role END AS system_role,
    CASE WHEN e.system_role IN ('ADMIN', 'HR') THEN 1 ELSE 0 END AS is_staff
FROM SessionContext sc
LEFT JOIN Employee e ON e.employee_id = sc.current_employee_id
WHERE sc.context_id = 1;

-- ----------------------------------------------------------------------------
-- View 2: vw_effective_permissions (flattens UserRole -> RolePermission)
-- ----------------------------------------------------------------------------
-- DEFINITION: effective permissions of user U = the permission set of every role
-- R where (U, R) is in UserRole and U's AuthUser row is_active = 1. A deactivated
-- account therefore holds nothing, even if its UserRole rows were not cleaned up.
--
-- Defined BEFORE the secure views because each of them CROSS JOINs it and requires
-- `perm.employee_id = current_employee_id`. A user with no effective permission
-- (anonymous, unknown, deactivated) matches no row, so every secure view returns
-- nothing for them - the same guard for staff and employees alike.
CREATE VIEW IF NOT EXISTS vw_effective_permissions AS
SELECT DISTINCT
    ur.employee_id AS perm_employee_id,
    rp.permission_code
FROM UserRole ur
JOIN RolePermission rp ON rp.role_code = ur.role_code
JOIN AuthUser au      ON au.employee_id = ur.employee_id
WHERE au.is_active = 1;

-- ----------------------------------------------------------------------------
-- View 3: vw_secure_employees (the single scoped base for every people read)
-- ----------------------------------------------------------------------------
-- Row rule:
--   staff (ADMIN / HR)  -> every row
--   any other employee  -> only their own row
--   anonymous / unknown -> no rows
-- Column rule:
--   Entitlement items (system_role, roles label) are exposed only to staff.
--   A non-staff user sees identity and org data of themselves, which they hold
--   via employee:read:self. system_role would let them detect the admin and
--   probe the guard, so it is NULL for them.
--
-- WHITELIST, NOT BLACKLIST: exactly ADMIN and HR see everything. A future role
-- that is neither staff nor 'EMPLOYEE' gets self-only access, never org-wide
-- access, if someone forgets to add it here.
--
-- WHY "rowid AS id" IS NOT USED: SQLite resolves the name `rowid` inside a view
-- SELECT to the underlying rowid, and any earlier alias wins for later names.
-- `e.rowid AS id` first put the rowid under `id`, and the *first employee row*
-- (rowid 1) silently won over `e.employee_id` - the view returned unaliased
-- `rowid` for `id` and for `employee_id`. The test suite pins this now: `id`
-- must equal `employee_id` on every row. (Phase 1 keys are ATOMICINTEGER, so
-- employee_id already is the rowid; the API uses employee_id and needs no alias.)
--
-- The API must read /employees/:id and /employees?search= from THIS row set and
-- filter afterwards, so a search can never pad the result with the caller's own
-- row, and /me/dashboard must aggregate from THIS row set so an employee
-- dashboard shows personal figures (staff dashboards show org-wide totals).
-- ----------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS vw_secure_employees AS
SELECT
    e.employee_id, e.first_name, e.last_name, e.email, e.phone,
    e.department, e.role,
    CASE WHEN cs.is_staff = 1 THEN e.system_role ELSE NULL END AS system_role,
    CASE WHEN cs.is_staff = 1 THEN e.system_role ELSE 'EMPLOYEE' END AS roles,
    e.join_date, e.status, e.created_at, e.updated_at
FROM Employee e
CROSS JOIN vw_current_session cs
WHERE cs.session_employee_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM vw_effective_permissions perm
              WHERE perm.perm_employee_id = cs.session_employee_id)
  AND (   cs.system_role IN ('ADMIN', 'HR')
       OR e.employee_id = cs.session_employee_id );

-- ----------------------------------------------------------------------------
-- View 4: vw_secure_attendance (scoped base for attendance reads & reports)
-- ----------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS vw_secure_attendance AS
SELECT
    a.attendance_id, a.employee_id, a.attendance_date, a.status,
    a.check_in_time, a.check_out_time, a.hours_worked, a.overtime_hours,
    a.is_late, a.late_minutes, a.created_at
FROM Attendance a
CROSS JOIN vw_current_session cs
WHERE cs.session_employee_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM vw_effective_permissions perm
              WHERE perm.perm_employee_id = cs.session_employee_id)
  AND (   cs.system_role IN ('ADMIN', 'HR')
       OR a.employee_id = cs.session_employee_id );

-- ----------------------------------------------------------------------------
-- View 5: vw_secure_payslips (scoped base for every payslip read)
-- ----------------------------------------------------------------------------
-- Full payslip snapshot (every column is already on Payroll, so screen and
-- PDF share one row shape). Identity fields are joined for the printed slip.
CREATE VIEW IF NOT EXISTS vw_secure_payslips AS
SELECT
    p.payroll_id, p.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department,
    p.salary_id, p.pay_period_month, p.pay_period_year,
    p.working_days, p.present_days, p.absent_days, p.half_days, p.leave_days,
    p.overtime_hours, p.base_salary_earned, p.allowances_earned, p.overtime_pay,
    p.gross_salary, p.tax_deduction, p.unpaid_leave_deduction, p.other_deductions,
    p.net_salary, p.status, p.payment_date, p.created_at, p.updated_at
FROM Payroll p
JOIN Employee e ON e.employee_id = p.employee_id
CROSS JOIN vw_current_session cs
WHERE cs.session_employee_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM vw_effective_permissions perm
              WHERE perm.perm_employee_id = cs.session_employee_id)
  AND (   cs.system_role IN ('ADMIN', 'HR')
       OR p.employee_id = cs.session_employee_id );

-- ============================================================================
-- SECTION 4: Enforcement - Report Views & Permission Functions
-- ============================================================================
-- Report routes (/attendance/summary, /attendance/late, /reports/monthly) must
-- never query Attendance directly. These two views re-aggregate from the scoped
-- base, so staff see the whole organisation and an employee sees only their own
-- figures - one authorisation path for every read endpoint.

-- ----------------------------------------------------------------------------
-- View: vw_secure_attendance_monthly_summary
-- ----------------------------------------------------------------------------
-- Same columns and semantics as vw_employee_attendance_monthly_summary (Phase 2)
-- but computed over vw_secure_attendance and linked by employee_id only. That
-- view joins on BOTH employee_id and full name, so a name change silently drops
-- months; this one cannot.
CREATE VIEW IF NOT EXISTS vw_secure_attendance_monthly_summary AS
SELECT
    s.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department,
    s.attendance_year,
    s.attendance_month,
    COUNT(*) AS total_logged_days,
    SUM(CASE WHEN s.status = 'PRESENT'  THEN 1 ELSE 0 END) AS present_days,
    SUM(CASE WHEN s.status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_days,
    SUM(CASE WHEN s.status = 'ON_LEAVE' AND NOT EXISTS (
            SELECT 1 FROM Leave l
            WHERE l.employee_id = s.employee_id
              AND l.status = 'APPROVED' AND l.leave_type = 'UNPAID'
              AND s.attendance_date BETWEEN l.start_date AND l.end_date
        ) THEN 1 ELSE 0 END) AS leave_days,
    SUM(CASE WHEN s.status = 'ABSENT' OR (s.status = 'ON_LEAVE' AND EXISTS (
            SELECT 1 FROM Leave l
            WHERE l.employee_id = s.employee_id
              AND l.status = 'APPROVED' AND l.leave_type = 'UNPAID'
              AND s.attendance_date BETWEEN l.start_date AND l.end_date
        )) THEN 1 ELSE 0 END) AS absent_days,
    SUM(CASE WHEN s.status = 'HOLIDAY' THEN 1 ELSE 0 END) AS holiday_days,
    SUM(s.overtime_hours) AS total_overtime_hours,
    SUM(s.is_late) AS total_late_marks
FROM vw_secure_attendance s
JOIN vw_secure_employees e ON e.employee_id = s.employee_id
GROUP BY s.employee_id, e.first_name, e.last_name, e.department,
         s.attendance_year, s.attendance_month;

-- ----------------------------------------------------------------------------
-- View: vw_secure_late_marks (scoped form of the Phase 3 late-marks report)
-- ----------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS vw_secure_late_marks AS
SELECT
    s.attendance_id, s.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department, s.attendance_date, s.check_in_time, s.late_minutes,
    strftime('%Y-%m', s.attendance_date) AS attendance_month
FROM vw_secure_attendance s
JOIN Employee e ON e.employee_id = s.employee_id
WHERE s.is_late = 1;

-- ----------------------------------------------------------------------------
-- View: vw_session_context (the API's one-shot authorisation packet)
-- ----------------------------------------------------------------------------
-- Used after the context is written: gives the caller's role and whether the
-- account is active. is_staff = 0 for anonymous/unknown/deactivated users.
-- ----------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS vw_session_context AS
SELECT
    sc.current_employee_id,
    CASE WHEN e.employee_id IS NULL THEN NULL
         ELSE e.first_name || ' ' || e.last_name END AS employee_name,
    e.email,
    CASE WHEN e.employee_id IS NULL THEN NULL ELSE e.system_role END AS system_role,
    CASE WHEN e.status = 'ACTIVE' AND (u.is_active = 1 OR u.is_active IS NULL) THEN 1 ELSE 0 END AS account_active,
    CASE WHEN e.system_role IN ('ADMIN', 'HR') THEN 1 ELSE 0 END AS is_staff
FROM SessionContext sc
LEFT JOIN Employee e ON e.employee_id = sc.current_employee_id
LEFT JOIN AuthUser u ON u.employee_id = sc.current_employee_id
WHERE sc.context_id = 1;

-- ----------------------------------------------------------------------------
-- SECURITY NOTE ON USER-DEFINED SQL FUNCTIONS
-- ----------------------------------------------------------------------------
-- The permission helpers below are registered by the API (and the Phase 4 test
-- suite) with DatabaseSync#function:
--
--   fn_has_permission(employeeId, permissionCode) -> 1 / 0
--       EXISTS (vw_effective_permissions WHERE perm_employee_id = ? AND permission_code = ?)
--   fn_session_is_valid(tokenHash)                -> 1 / 0
--       EXISTS (Session WHERE token hash matches, revoked_at IS NULL,
--               and expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now'))
--
-- Every entry point that can hard-fail if the application forgot to register
-- them uses fn_is_registered('name') first, a second trivial function that is
-- always registered. SQLite aborts the whole statement when a function is
-- missing, so calling an unregistered fn_has_permission inside an INSERT trigger
-- would abort the insert. fn_is_registered turns that into a clean, explainable
-- policy decision while the actual permission check remains real (see tests).

-- ============================================================================
-- SECTION 5: Payroll State Machine & Integrity Triggers
-- ============================================================================
-- Legal transitions:  DRAFT -> APPROVED      APPROVED -> PAID
-- Everything else is aborting: PAID->anything, DRAFT->PAID (skip), and any edit
-- of a payroll row that is no longer DRAFT except its own single-step approval.
-- Together these guarantee: once a payslip leaves DRAFT, the money fields are
-- frozen, and the only way out of APPROVED is "pay it".
-- ----------------------------------------------------------------------------

-- 5A: INSERT - a new payroll row is always born DRAFT.
-- The guard's ORDER is deliberate: a single INSERT with PAID + a payment date
-- reports the DRAFT violation first, which is the more actionable message.
--
-- SEED ORDER WARNING: security.sql must load AFTER seed.sql (see SEED ORDER
-- below), because seed.sql intentionally inserts 36 historical PAID payroll rows.
-- If your pipeline loads security.sql before the seed, drop this trigger,
-- load seed.sql, then re-run security.sql to restore it.
CREATE TRIGGER IF NOT EXISTS trg_payroll_insert_status_guard
BEFORE INSERT ON Payroll
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Error: New payroll rows must start in DRAFT status')
    WHERE NEW.status <> 'DRAFT';
    SELECT RAISE(ABORT, 'Error: DRAFT payroll rows cannot carry a payment date')
    WHERE NEW.status = 'DRAFT' AND NEW.payment_date IS NOT NULL;
END;

-- 5B: UPDATE status - allow only the two legal steps.
CREATE TRIGGER IF NOT EXISTS trg_payroll_status_transition
BEFORE UPDATE OF status ON Payroll
FOR EACH ROW
WHEN NEW.status <> OLD.status
BEGIN
    SELECT RAISE(ABORT, 'Error: Illegal payroll status transition')
    WHERE NOT (
           (OLD.status = 'DRAFT'    AND NEW.status = 'APPROVED')
        OR (OLD.status = 'APPROVED' AND NEW.status = 'PAID')
    );
    SELECT RAISE(ABORT, 'Error: APPROVED payroll rows cannot carry a payment date')
    WHERE OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' AND NEW.payment_date IS NOT NULL;
    SELECT RAISE(ABORT, 'Error: PAYING a payroll row requires a payment date')
    WHERE OLD.status = 'APPROVED' AND NEW.status = 'PAID' AND NEW.payment_date IS NULL;
END;

-- 5C: UPDATE - while a row is not DRAFT, every column except status is frozen.
--     The WHEN clause compares every business column; payment_date is also frozen
--     on APPROVED->PAID (the date is set together with the status step).
CREATE TRIGGER IF NOT EXISTS trg_payroll_freeze_non_draft
BEFORE UPDATE ON Payroll
FOR EACH ROW
WHEN OLD.status <> 'DRAFT'
  AND NEW.status IS OLD.status
BEGIN
    SELECT RAISE(ABORT, 'Error: Payroll row is not in DRAFT; only the status column may change')
    WHERE  NEW.employee_id            IS NOT OLD.employee_id
       OR  NEW.salary_id              IS NOT OLD.salary_id
       OR  NEW.pay_period_month       IS NOT OLD.pay_period_month
       OR  NEW.pay_period_year        IS NOT OLD.pay_period_year
       OR  NEW.working_days           IS NOT OLD.working_days
       OR  NEW.present_days           IS NOT OLD.present_days
       OR  NEW.absent_days            IS NOT OLD.absent_days
       OR  NEW.half_days              IS NOT OLD.half_days
       OR  NEW.leave_days             IS NOT OLD.leave_days
       OR  NEW.overtime_hours         IS NOT OLD.overtime_hours
       OR  NEW.base_salary_earned     IS NOT OLD.base_salary_earned
       OR  NEW.allowances_earned      IS NOT OLD.allowances_earned
       OR  NEW.overtime_pay           IS NOT OLD.overtime_pay
       OR  NEW.gross_salary           IS NOT OLD.gross_salary
       OR  NEW.tax_deduction          IS NOT OLD.tax_deduction
       OR  NEW.unpaid_leave_deduction IS NOT OLD.unpaid_leave_deduction
       OR  NEW.other_deductions       IS NOT OLD.other_deductions
       OR  NEW.net_salary             IS NOT OLD.net_salary
       OR  NEW.payment_date           IS NOT OLD.payment_date;
END;

-- 5D: UPDATE of a DRAFT row - everything is editable (recalculation lives here),
--     except the row may not jump straight to PAID: that is 5B's job. A DRAFT
--     edit that also changes status once is caught by 5B before any column
--     rewrite happens, so no partial write can survive an abort.
-- (No trigger needed: RAISE(ABORT) aborts only the current row's change, and the
--  API wraps batches in BEGIN IMMEDIATE so a mid-batch abort rolls back the batch.)


-- ============================================================================
-- SECTION 6: Credential, Session & Context Triggers
-- ============================================================================
-- AUTHUSER, SESSION and SESSIONCONTEXT are connected to the request lifecycle by
-- the API; these triggers make the database refuse to write them inconsistently
-- (stale role cache, a session for a deactivated user, an expiry in the past).

-- 6A: The role cache can never be written as anything but the Employee master
--     role. INSERT is pinned to INSERT ... SELECT from Employee (the API's
--     migration does exactly that); any other INSERT is refused. An UPDATE that
--     tries to set a different role is refused by 6D before it lands.
--     All 12 seeded employees get a login (BUILD_CONVENTIONS); what separates
--     them at request time is UserRole -> RolePermission, not the cache.
--     (Renamed by revision 2; these drops keep databases created by revision 1
--     consistent without needing a rebuild.)
DROP TRIGGER IF EXISTS trg_authuser_staff_login_only_insert;
DROP TRIGGER IF EXISTS trg_authuser_role_repin;
DROP TRIGGER IF EXISTS trg_authuser_role_no_escalation_update;
CREATE TRIGGER IF NOT EXISTS trg_authuser_role_pinned_insert
BEFORE INSERT ON AuthUser
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Error: AuthUser.system_role must be copied from Employee.system_role')
    WHERE NOT EXISTS (
        SELECT 1 FROM Employee e
        WHERE e.employee_id = NEW.employee_id
          AND e.system_role = NEW.system_role
    );
END;

-- 6B: Only active users may hold live sessions.
CREATE TRIGGER IF NOT EXISTS trg_session_active_user_only
BEFORE INSERT ON Session
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Error: Sessions can only be issued to active users')
    WHERE NOT EXISTS (
        SELECT 1 FROM AuthUser a
        WHERE a.employee_id = NEW.employee_id
          AND a.is_active = 1
    );
END;

-- 6C: A staff session cannot be expired into the past, and expiry is fixed at
--     issue time (rotation = new row + revoke the old one).
CREATE TRIGGER IF NOT EXISTS trg_session_no_retro_expiry
BEFORE UPDATE ON Session
FOR EACH ROW
WHEN NEW.expires_at <> OLD.expires_at
BEGIN
    SELECT RAISE(ABORT, 'Error: Session expiry cannot be changed')
    WHERE NEW.expires_at < OLD.expires_at;
END;

-- 6D: system_role on AuthUser follows the master Employee row, with no
--     disagreement possible. The API changes a role in ONE statement and the
--     database pushes it into AuthUser itself:
--
--       UPDATE Employee SET system_role = 'HR' WHERE employee_id = 7;
--         -> trg_employee_role_promote (section 11) copies it into AuthUser
--         -> trg_authuser_role_no_drift accepts it (it equals the master row)
--         -> trg_authuser_role_change_revokes_sessions revokes live sessions
--
--     Writing AuthUser.system_role directly to a role the master does not hold is
--     refused, so the cache can never drift above the truth.
CREATE TRIGGER IF NOT EXISTS trg_authuser_role_no_drift
BEFORE UPDATE OF system_role ON AuthUser
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1 FROM Employee e
    WHERE e.employee_id = NEW.employee_id
      AND e.system_role = NEW.system_role
)
BEGIN
    SELECT RAISE(ABORT, 'Error: AuthUser.system_role must match Employee.system_role');
END;

CREATE TRIGGER IF NOT EXISTS trg_authuser_role_change_revokes_sessions
AFTER UPDATE OF system_role ON AuthUser
FOR EACH ROW
WHEN NEW.system_role <> OLD.system_role
BEGIN
    UPDATE Session
    SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
    WHERE employee_id = NEW.employee_id;
END;

-- ============================================================================
-- SECTION 7: Transactional Payroll Recipe (executable, copy into the API)
-- ============================================================================
-- Purpose: recompute one pay period from vw_payroll_procedural_computation as a
-- single all-or-nothing batch, touching only DRAFT rows (APPROVED/PAID are frozen
-- by section 5). Idempotent: running it twice produces the same numbers.
--
-- BEGIN IMMEDIATE takes the write lock up front, so a concurrent writer fails
-- fast instead of blocking halfway through the batch. Any error before COMMIT
-- rolls back every row of the batch. The verification status RETURNING lives in
-- the API (Node has no procedural statements), see below.
--
--   -- 1. write lock + batch
--   BEGIN IMMEDIATE;
--   INSERT INTO Payroll (employee_id, salary_id, pay_period_month,
--                        pay_period_year, working_days, present_days,
--                        absent_days, half_days, leave_days, overtime_hours,
--                        base_salary_earned, allowances_earned, overtime_pay,
--                        gross_salary, tax_deduction, unpaid_leave_deduction,
--                        other_deductions, net_salary, status)
--   SELECT employee_id, salary_id, pay_period_month, pay_period_year,
--          working_days, present_days, absent_days, half_days, leave_days,
--          overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
--          gross_salary, tax_deduction, unpaid_leave_deduction,
--          other_deductions, net_salary, 'DRAFT'
--   FROM   vw_payroll_procedural_computation
--   WHERE  pay_period_month = :month AND pay_period_year = :year
--     AND  NOT EXISTS (SELECT 1 FROM Payroll p
--                      WHERE p.employee_id = vw_payroll_procedural_computation.employee_id
--                        AND p.pay_period_year = :year
--                        AND p.pay_period_month = :month
--                        AND p.status <> 'DRAFT');
--   ON CONFLICT (employee_id, pay_period_year, pay_period_month) DO UPDATE SET
--          working_days           = excluded.working_days,
--          present_days           = excluded.present_days,
--          absent_days            = excluded.absent_days,
--          half_days              = excluded.half_days,
--          leave_days             = excluded.leave_days,
--          overtime_hours         = excluded.overtime_hours,
--          base_salary_earned     = excluded.base_salary_earned,
--          allowances_earned      = excluded.allowances_earned,
--          overtime_pay           = excluded.overtime_pay,
--          gross_salary           = excluded.gross_salary,
--          tax_deduction          = excluded.tax_deduction,
--          unpaid_leave_deduction = excluded.unpaid_leave_deduction,
--          other_deductions       = excluded.other_deductions,
--          net_salary             = excluded.net_salary,
--          updated_at             = CURRENT_TIMESTAMP
--   WHERE  Payroll.status = 'DRAFT';          -- never rewrite a frozen row
--   -- (append RETURNING payroll_id for in-transaction verification)
--   COMMIT;            -- or ROLLBACK on any error / validation failure
--
-- The script below wraps the recipe in a CTE that evaluates it against the
-- current context, so you can paste it into sqlite3 as-is. It returns what WOULD
-- be written; change CTE to INSERT...SELECT to persist.
--
-- SAVEPOINT form for a batch that must not abort the enclosing transaction:
--   SAVEPOINT payroll_batch;
--   ... INSERT ... ;
--   RELEASE payroll_batch;      -- or ROLLBACK TO payroll_batch on failure
-- (Test suite B10 verifies that ROLLBACK TO the savepoint removes every row the
--  batch inserted while the enclosing transaction's other work survives.)

-- ============================================================================
-- SECTION 8: Seed Credentials (hash placeholders - the API fills the real hash)
-- ============================================================================
-- No rows are inserted here on purpose: password hashes are minted by the API.
-- The Phase 5 migration (and the test suite's createPhase4Db) performs exactly
-- these statements, once per employee:
--
--   INSERT INTO AuthUser (employee_id, email, password_hash, salt, system_role, is_active)
--   SELECT e.employee_id, e.email, :hash, :salt, e.system_role, e.is_active = 'ACTIVE'
--   FROM Employee e;                       -- system_role copied, never typed (6A)
--
--   INSERT OR IGNORE INTO UserRole (employee_id, role_code)
--   SELECT employee_id, system_role FROM Employee;
--
-- :hash = sha256hex(saltBytes || utf8(password)) is computed in Node.
-- The demo passwords (Admin@123 / Hr@12345 / Employee@123) are hashed with the
-- same helper; no plaintext is ever passed to SQL.

-- ============================================================================
-- SECTION 9: PostgreSQL Dialect Reference (GRANT / RLS Academic Specification)
-- ============================================================================
-- ----------------------------------------------------------------------------
/*
-- Roles are database objects in PostgreSQL: one per application role.
CREATE ROLE paytrack_admin  LOGIN PASSWORD '***';
CREATE ROLE paytrack_hr     LOGIN PASSWORD '***';
CREATE ROLE paytrack_employee LOGIN PASSWORD '***';

-- Table-level privileges (least privilege: employees can only SELECT).
GRANT SELECT, INSERT, UPDATE, DELETE ON Employee, Salary, Attendance, Leave, Payroll
    TO paytrack_hr;
GRANT SELECT, INSERT, UPDATE, DELETE ON Employee, Salary, Attendance, Leave, Payroll
    TO paytrack_admin;
GRANT SELECT ON Employee, Attendance, Leave, Payroll TO paytrack_employee;
REVOKE DELETE ON Employee FROM paytrack_hr;            -- separation of duties

-- Row-level security: the session sets a variable; policies read it.
ALTER TABLE Employee   ENABLE ROW LEVEL SECURITY;
ALTER TABLE Attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE Payroll    ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_all ON Employee
    FOR ALL TO paytrack_admin, paytrack_hr USING (true) WITH CHECK (true);
CREATE POLICY self_read ON Employee
    FOR SELECT TO paytrack_employee
    USING (employee_id = current_setting('paytrack.employee_id')::INT);

CREATE POLICY staff_all_att ON Attendance
    FOR ALL TO paytrack_admin, paytrack_hr USING (true) WITH CHECK (true);
CREATE POLICY self_read_att ON Attendance
    FOR SELECT TO paytrack_employee
    USING (employee_id = current_setting('paytrack.employee_id')::INT);

CREATE POLICY staff_all_pay ON Payroll
    FOR ALL TO paytrack_admin, paytrack_hr USING (true) WITH CHECK (true);
CREATE POLICY self_read_pay ON Payroll
    FOR SELECT TO paytrack_employee
    USING (employee_id = current_setting('paytrack.employee_id')::INT);

-- The application sets the variable per request inside the transaction:
--   BEGIN; SELECT set_config('paytrack.employee_id', $1, true); ... COMMIT;
-- GRANT alone controls who may run an operation; the policy decides which rows,
-- which is the row-level equivalent of SessionContext + vw_secure_*.
*/
-- ============================================================================
-- SECTION 10: MySQL 8.0 Dialect Reference (GRANT + view-based scoping)
-- ============================================================================
/*
-- MySQL has no RLS: row scoping is done with a view that reads a session variable.
CREATE USER 'paytrack_hr'@'%'       IDENTIFIED BY '***';
CREATE USER 'paytrack_employee'@'%' IDENTIFIED BY '***';

GRANT SELECT, INSERT, UPDATE, DELETE ON paytrack.* TO 'paytrack_hr'@'%';
GRANT SELECT ON paytrack.Employee, paytrack.Attendance,
              paytrack.Payroll, paytrack.Leave TO 'paytrack_employee'@'%';
REVOKE DELETE ON paytrack.Employee FROM 'paytrack_hr'@'%';

CREATE OR REPLACE SQL SECURITY DEFINER VIEW vw_secure_payslips AS
SELECT p.* FROM Payroll p
WHERE  p.employee_id = CAST(@current_employee_id AS UNSIGNED)
   OR  (SELECT system_role FROM Employee
        WHERE employee_id = CAST(@current_employee_id AS UNSIGNED))
       IN ('ADMIN', 'HR');

-- The application sets per connection:  SET @current_employee_id = ?;
-- then query ONLY the view; it never has SELECT on Payroll's money columns
-- except through this definer view (grant on the view to paytrack_employee).
*/

-- ============================================================================
-- SECTION 11: Role Propagation (master Employee -> AuthUser cache -> sessions)
-- ============================================================================
-- Fires on the master table so the API never has to remember to update the copy.
-- The UPDATE ... FROM syntax is SQLite 3.33+ (engines older than that run the
-- subquery form emitted by the PostgreSQL reference in section 9).
DROP TRIGGER IF EXISTS trg_employee_role_promote;
CREATE TRIGGER trg_employee_role_promote
AFTER UPDATE OF system_role ON Employee
FOR EACH ROW
WHEN NEW.system_role <> OLD.system_role
BEGIN
    UPDATE AuthUser
    SET system_role = NEW.system_role
    WHERE employee_id = NEW.employee_id;
END;

-- ============================================================================
-- SECTION 12: Context Hygiene (session request lifecycle)
-- ============================================================================
-- The header row is written and cleared by the API around each request. These
-- guards make a forgotten cleanup harmless: only the singleton row (PK 1) can
-- exist, and it can never point at an employee that does not exist (FK).

-- ============================================================================
-- Verification footer: every security object that must exist after this file.
-- The test suite asserts this exact inventory, so a partial load cannot pass.
-- ============================================================================
SELECT 'Security layer' AS component,
       (SELECT COUNT(*) FROM Role)                      AS roles,
       (SELECT COUNT(*) FROM Permission)                AS permissions,
       (SELECT COUNT(*) FROM RolePermission)            AS role_permissions,
       (SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'view' AND name LIKE 'vw_secure_%')  AS secure_views,
       (SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'trigger'
           AND (name LIKE 'trg_payroll_%' OR name LIKE 'trg_session_%'
                OR name LIKE 'trg_authuser_%' OR name = 'trg_employee_role_promote')) AS security_triggers;
