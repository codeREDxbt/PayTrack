# PayTrack — Phase 4: Security, Access Control & Transaction Integrity

| | |
|---|---|
| Candidate | Vinayak |
| Roll Number | 2501730150 |
| Course | Database Management Systems (Capstone Phase 4) |
| Engine | SQLite 3.51.3 via Node.js v24 `node:sqlite` |
| Schema file | `database/security.sql` (loads after `schema` → `procedures` → `triggers` → `seed`) |
| Suite | `node tests/phase4_security.test.js` — 51 / 51 passing |
| Regression | `node tests/run_e2e.js` — 134 / 134, `node tests/run_reports.js` — 46 / 46 |

Phase 4 adds the identity, authorisation and integrity layer underneath the Phase 5 API. Nothing in
`database/schema.sql`, `procedures.sql`, `triggers.sql` or `seed.sql` was weakened to make it work.

---

## 1. What was added

### 1.1 Identity

| Object | Purpose |
|---|---|
| `AuthUser` | 1:1 login identity per `Employee`. Stores `email` (UNIQUE COLLATE NOCASE), `password_hash`, `salt`, a cached `system_role`, `is_active` and `last_login_at`. |
| `Session` | Opaque bearer sessions. Primary key is `session_token_hash`; the token itself is never stored. `expires_at > issued_at` is enforced by `CHECK`. |
| `SessionContext` | A single row (`context_id = 1`) holding the identity the row-level views should resolve. Written by the API, not by end users. |

`password_hash` is the SHA-256 hex of `salt || password`, with a per-user 16-byte random salt. The
database never sees a plaintext password, and a `Session` row cannot be replayed from a database
dump because only its digest is stored.

### 1.2 Authorisation (RBAC)

`Role` → `RolePermission` → `Permission`, with `UserRole` binding an employee to a role.

| Role | Permissions |
|---|---|
| `ADMIN` | all 18 |
| `HR` | 17 (everything except `employee:delete`) |
| `EMPLOYEE` | 5 self-scoped permissions: read self for employee/attendance/payroll/leave, plus `auth:session:self` |

Permissions are data, not code: `vw_effective_permissions` answers "what may this account do?" with
one query, and the API's `fn_has_permission(employeeId, code)` SQL function is registered by
`server/db.js` against that view.

### 1.3 Row-level secure views

These views are the authorisation boundary for reads. Every one of them requires a non-NULL
`SessionContext` identity, an active credential and at least one effective permission; otherwise they
return **zero rows** rather than unfiltered data.

| View | Row rule | Column rule |
|---|---|---|
| `vw_current_session` | one row for the context identity | `system_role`, `is_staff` (`NULL`/`0` when anonymous) |
| `vw_secure_employees` | staff: every employee; employee: self only | `system_role` is `NULL` for non-staff; `roles` reads `EMPLOYEE` |
| `vw_secure_attendance` | staff: every punch; employee: own punches | — |
| `vw_secure_payslips` | staff: every slip; employee: own slips | — |
| `vw_secure_attendance_monthly_summary` | same as attendance, re-aggregated per employee-month | — |
| `vw_secure_late_marks` | late punches inside the caller's own row scope | — |

`vw_session_context` exposes the resolved role, `account_active` and `is_staff` for the API's
one-shot authorisation packet.

### 1.4 Triggers (9 in total)

| Trigger | Rule |
|---|---|
| `trg_payroll_insert_status_guard` | A new payroll row must be `DRAFT` and carry no payment date. |
| `trg_payroll_status_transition` | Only `DRAFT → APPROVED` and `APPROVED → PAID`; `PAID` needs a payment date; `APPROVED` may not carry one. |
| `trg_payroll_freeze_non_draft` | While a row is not `DRAFT`, every column except `status` is frozen. |
| `trg_authuser_role_pinned_insert` | `AuthUser.system_role` must be copied from `Employee.system_role`. |
| `trg_authuser_role_no_drift` | The cached role can never disagree with the master row. |
| `trg_authuser_role_change_revokes_sessions` | A role change revokes that employee's live sessions. |
| `trg_session_active_user_only` | Sessions can only be issued to active credentials. |
| `trg_session_no_retro_expiry` | Session expiry cannot be moved into the past. |
| `trg_employee_role_promote` | Changing `Employee.system_role` propagates into `AuthUser` in the same statement. |

Phase 2's attendance triggers (future-date abort, OT-on-`ABSENT` abort, OT > `hours_worked` abort,
automatic late-mark) are untouched and still tested here.

### 1.5 Transactional payroll recipe

`security.sql` section 7 documents the `BEGIN IMMEDIATE` batch the API uses in
`POST /api/payroll/generate`: stage the computation once, insert missing rows, refresh existing
`DRAFT` rows, `COMMIT`; any error `ROLLBACK`s the whole batch. Section 7 also shows the
`SAVEPOINT` form for a batch inside a larger transaction.

---

## 2. Suite design

`tests/phase4_security.test.js` follows the repository's plain-runner style (no Jest/Mocha). It builds
one template database in `os.tmpdir()` from the real SQL files, then copies it per case so no case can
observe another's writes. `database/paytrack.sqlite` is never touched.

Exactly one deliberate breaking change is made inside each hostile case, and the expected error is
asserted by message, not merely by "something threw".

Case classes:

| Class | Meaning | Count |
|---|---|---|
| `VALID` | the intended path works and produces the expected rows/values | 19 |
| `INVALID` | the hostile/malformed action is refused, with a specific reason | 25 |
| `BOUND` | a threshold value is accepted and one unit past it is rejected | 7 |

### 2.1 Groups

| Group | Cases | Covers |
|---|---|---|
| S — secure views | `P4-S01…S09` | employee/HR/admin/anonymous visibility, hidden role column, RBAC permission counts |
| A — access control | `P4-A01…A07` | cross-employee reads, write/delete denials, inactive accounts, role escalation, role-change revocation |
| C — credentials & sessions | `P4-C01…C07` | password verification, wrong/empty passwords, plaintext hash, revoked token, expiry boundary, empty token, retro-expiry |
| P — payroll state machine & transactions | `P4-P01…P13` | legal and illegal transitions, freeze, batch commit, mid-batch rollback, idempotency, `SAVEPOINT` |
| B — boundaries | `P4-B01…B11` | negative money, month/year edges, duplicate attendance, OT bounds, lateness boundaries, ABSENT+OT, future dates |
| I — integration facts | `P4-I01…I04` | prepared statements fire triggers, fallback DDL coexistence, reverse load order, object inventory |

### 2.2 Notable boundary results

- `09:30:00` is on time; `09:30:01` is late with `late_minutes = 0` (whole-minute truncation). `10:45:00`
  is late by exactly 75 minutes.
- `hours_worked = 24.00` and `overtime_hours = 16.00` are accepted; `24.01` / `16.01` are rejected by the
  column `CHECK`. Overtime above `hours_worked` is caught by the Phase 2 trigger first, so the two
  layers are asserted separately.
- A session is rejected at exactly `expires_at` and accepted 1 ms earlier.
- Month `1` and `12` are accepted for a pay period; `0` and `13` are rejected. A `2020` period is
  accepted, `2019` is not.

### 2.3 Failed-batch proof (P4-P10)

Inside one `BEGIN IMMEDIATE`, the recipe inserts two employees' payroll rows and updates a third
pre-existing `DRAFT` row, then throws at the second employee. After `ROLLBACK`:

- the period holds exactly the one pre-batch row;
- that row's `net_salary` is the pre-batch value (the `UPDATE` was undone too);
- the admin secure view shows the pre-batch row, the employee whose insert was rolled back sees none;
- the `INSERT` trigger's `DRAFT` guard never had to reject anything, so the rollback is genuinely the
  transaction's doing.

---

## 3. Reproducing

```powershell
node tests/phase4_security.test.js
node tests/phase4_security.test.js --verbose
node tests/run_e2e.js
node tests/run_reports.js
```

The runner exits `0` only when all 51 cases pass, and prints `VALID`/`INVALID`/`BOUND` subtotals.

To build a database with the security layer by hand:

```bash
sqlite3 database/paytrack.sqlite \
  ".read database/schema.sql" \
  ".read database/procedures.sql" \
  ".read database/triggers.sql" \
  ".read database/seed.sql" \
  ".read database/security.sql"
```

`security.sql` must load after `seed.sql` because the seed inserts 36 historical `PAID` payroll rows
while the insert guard requires new rows to be `DRAFT`. Loading it in the other order is supported by
dropping that guard, seeding, then re-running `security.sql` — `P4-I03` proves this sequence, and every
object in the file uses `IF NOT EXISTS` so re-running is safe.

---

## 4. What is verified, and what is not

Verified by execution:

- Column-level, FK, UNIQUE and trigger invariants, with exact error messages.
- Row scoping for an employee, an HR user, an admin and an anonymous context.
- RBAC counts: 3 roles, 18 permissions, ADMIN 18, HR 17, EMPLOYEE 5.
- Credential storage and verification, session issuance/revocation/expiry boundaries.
- Payroll state machine, freeze rules, batch atomicity, idempotency and savepoint behaviour.
- Reverse pipeline order, fallback DDL coexistence and object inventory.

Not verified here:

- No HTTP layer is exercised in this suite; Phase 5 (`tests/run_api.js`) covers the routes that map
  these database rules onto status codes.
- `SessionContext` is written directly by the tests. That it is written correctly per request, and
  cannot be reused across users, is a server concern tested in Phase 5.
- No concurrency test with multiple processes; SQLite's single-writer model and `BEGIN IMMEDIATE` are
  relied on, not benchmarked.
- No wall-clock performance claim is made.
