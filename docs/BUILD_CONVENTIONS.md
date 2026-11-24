# PayTrack — Phase 3–5 Build Conventions

This file is the shared contract for parallel work in this repository. Follow it exactly so the pieces fit together.

## Project facts (do not redo)
- Phase 1 done: `database/schema.sql` (3NF), `docs/DATABASE_MODELING.md`.
- Phase 2 done: `database/procedures.sql` (views `vw_employee_attendance_monthly_summary`, `vw_payroll_procedural_computation`), `database/triggers.sql`, `database/seed.sql` (12 employees, Aug–Oct 2026, 1,104 attendance rows, 36 payroll rows), `docs/PROCEDURAL_IMPLEMENTATION.md`. Existing suite `node test/run_e2e.js` = 134/134 passing — **never break it**.
- Engine: SQLite (Node.js v24 `node:sqlite`). No npm dependencies for DB/API code.
- Student header used in every SQL file: Vinayak / 2501730150 / DBMS.
- Working dir: `E:\Projects\Paytrack`. Platform Windows, shell bash (Git Bash). Node v24.

## File ownership (do not edit files outside your list)
| Area | Files |
|---|---|
| Phase 3 | `database/reports.sql`, `test/run_reports.js`, `test/phase3_reports.test.js`, `docs/QUERY_REPORTS.md` |
| Phase 4 | `database/security.sql`, `test/phase4_security.test.js`, `docs/SECURITY_TESTING.md` |
| API + docs | `server/**`, `test/phase5_api.test.js`, `test/run_api.js`, `docs/API_REFERENCE.md` |
| Frontend | `src/**`, `index.html` if truly needed |
| Docs | `README.md`, `docs/FINAL_REPORT.md` |

## Standard SQL file header (copy it)
```sql
-- ============================================================================
-- PayTrack Enterprise Payroll & Attendance Management System
-- <Title> (Phase N <description>)
-- ============================================================================
-- Candidate Name : Vinayak
-- Roll Number    : 2501730150
-- Course         : Database Management Systems (CapStone Phase N)
-- Engine Target  : SQLite 3 Engine & Node.js Native Runtime
-- Dialect Mirrors: PostgreSQL 14+ & MySQL 8.0+ (commented reference blocks)
-- ============================================================================
```

## Engine rules (SQLite)
- `PRAGMA foreign_keys = ON;` at the top of every script.
- Seed dates are **August–October 2026**. `triggers.sql` rejects attendance dated after `CURRENT_DATE`. If a test needs "today", use a fixed recent date like `2026-11-02`, or a past date inside the seed window. Do not insert attendance with dates after today.
- Triggers that exist and must not be weakened: overlapping approved-leave abort, future-date abort, OT-on-ABSENT abort, OT > hours_worked abort, auto late-mark on CHECK_IN after `09:30:00`.
- Payroll statuses: `DRAFT → APPROVED → PAID`. Recalculation is only allowed while `DRAFT`.

## The one API contract (server + frontend both implement to this)
- Base URL: `http://localhost:4000/api`. JSON in, JSON out. Every response body is `{ "data": <payload> }` or `{ "error": { "code": "<CODE>", "message": "...", "details"?: ... } }`.
- Errors never leak stack traces. Use these codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `CONFLICT` (409), `DB_CONSTRAINT` (400, from a SQLite `CHECK`/`UNIQUE`/trigger abort — pass the trigger message through), `INTERNAL` (500).
- Auth header: `Authorization: Bearer <token>`. Tokens are opaque session strings minted by `POST /api/auth/login`; stored hashed in the `Session` table; expiry 12 h.
- Role mapping: `Employee.system_role` ∈ `ADMIN | HR | EMPLOYEE`. `ADMIN` and `HR` share the **staff** permission set; `EMPLOYEE` is read-only and scoped to `auth.employee_id`.
- `403 FORBIDDEN` must be returned — with the same status whether the row exists or not — when an EMPLOYEE requests another employee's payslip, attendance, or when any non-staff calls a write endpoint.

### Endpoints
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }`. Firestore-independent demo accounts in `hr@hr`, etc.: `rajesh.sharma@paytrack.internal` / `Admin@123` (ADMIN), `sunita.rao@paytrack.internal` / `Hr@12345` (HR), `priya.patel@paytrack.internal` / `Employee@123` (EMPLOYEE). Wrong password → 401 `UNAUTHENTICATED`. |
| GET | `/auth/me` | any | current `user` |
| POST | `/auth/logout` | any | revoke session |
| GET | `/me/dashboard` | any | employee-scoped KPIs (staff: org-wide) |
| GET | `/employees?search=&department=&status=` | any (employee: only self) | |
| GET | `/employees/:id` | staff or self | |
| POST | `/employees` | staff | creates Employee + active Salary row in one transaction |
| PATCH | `/employees/:id` | staff | |
| DELETE | `/employees/:id` | ADMIN only | |
| GET | `/employees/:id/attendance?month=YYYY-MM` | staff or self | |
| GET | `/attendance?month=YYYY-MM&employeeId=` | staff | employee ignored/forced to self |
| POST | `/attendance` | staff | `{ employeeId, date, status, checkInTime?, checkOutTime?, hoursWorked?, overtimeHours? }`; unique (emp,date) conflict → 409 `CONFLICT`; trigger aborts → 400 `DB_CONSTRAINT` |
| PATCH | `/attendance/:id` | staff | |
| GET | `/attendance/summary?month=YYYY-MM` | staff | Phase-3 monthly summary report |
| GET | `/attendance/late?month=YYYY-MM` | staff | Phase-3 late-marks report |
| POST | `/payroll/generate` | staff | `{ month: "YYYY-MM" }` — Phase-4 transaction; all-or-nothing |
| GET | `/payroll?month=YYYY-MM` | staff | |
| GET | `/payroll/me?month=YYYY-MM` | employee | own payslips only |
| GET | `/payroll/:id/payslip` | staff or owner | full payslip incl. salary breakdown |
| PATCH | `/payroll/:id/status` | staff | `DRAFT→APPROVED→PAID` only, else 422 |
| GET | `/reports/monthly?month=YYYY-MM` | staff | department rollup + totals |

Login users are seeded from `Employee` rows: the API, on first migration, adds an `AuthUser` table and inserts credentials for the 12 seeded employees using the email in `Employee.email`. Password policy for seed: ADMIN/HR → `Admin@123` / `Hr@12345`, employees → `Employee@123`. Store `password_hash` = SHA-256 of `salt + password` with a per-user random salt (`crypto.randomBytes`). Never store plaintext.

## Tests
- Use `node:test`-free style already in the repo? No — for new suites use plain `node test/run_x.js` runners in the same style as `test/run_e2e.js` (own tiny `test(id, desc, fn)` helper, pass/fail counts, exit code 1 on failure) so output stays consistent.
- Build fresh databases in `os.tmpdir()` per suite from the SQL files; never mutate `database/paytrack.sqlite`.
- Phase 3 must include a real `EXPLAIN QUERY PLAN` comparison: run the same report query on a schema **without** the new report indexes vs **with** them, and assert the plan changes from `SCAN` to `SEARCH ... USING INDEX`. Capture both plans as text for the doc.
- Phase 4 must cover valid, invalid, and boundary cases: negative/zero salary, duplicate attendance, unauthorized access (EMPLOYEE calling staff endpoints, cross-employee reads), invalid month, closed payroll period, and a forced mid-transaction failure that rolls back **every** code inserted in that batch.
- API suite: start the server on an ephemeral port (`startApiServer({ port: 0, dbPath })` exported from `server/server.js`), use `fetch`, and test every endpoint and every role.

## Style
- Comments explain *why*, not *what*. No emojis in code. Keep line width reasonable.
- TypeScript frontend: strict types, no `any` in the new code, `npm run build` must pass.
- Do not commit. Leave files in the working tree.
