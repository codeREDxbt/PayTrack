# PayTrack — Final Project Report

**Payroll & Attendance Management System**

| | |
|---|---|
| **Student Name** | Vinayak |
| **Roll Number** | 2501730150 |
| **Course** | Database Management Systems |
| **University** | K.R. Mangalam University |
| **Project** | PayTrack – Payroll & Attendance Management System |
| **Deliverable** | Phase 5 — Integration, UI and Final Presentation |

---

## 1. Executive summary

PayTrack is an end-to-end payroll and attendance system for a small to mid-sized organisation. It was
built in five phases: relational modelling, procedural logic and triggers, reporting and indexing,
security and access control, then a role-based web client connected to the real backend.

The guiding decision was that **the database owns the business rules**. Salary, overtime, tax, unpaid
leave and late marks are computed by SQL procedures and views; attendance and payroll integrity is
enforced by triggers and constraints; and access control is enforced by row-level secure views backed
by an RBAC model stored as data. The Node API validates and authorises requests and maps database
outcomes onto HTTP, while the React client only renders what the API returns. A UI bug therefore cannot
change a payslip, and a direct SQL client still cannot violate the rules.

The seeded organisation — 12 employees across 7 departments, 1,104 attendance rows and 36 payslips over
three months — is small enough to check by hand and rich enough to exercise every rule: unpaid versus
paid leave, overtime, half days, absences, late punches and tax slabs. All four test suites pass:
**134** end-to-end database tests, **46** reporting tests, **51** security tests and **94** API tests
(325 assertions total).

---

## 2. Problem statement and objectives

Manual payroll in a small organisation typically lives in spreadsheets: attendance is entered by hand,
overtime and unpaid leave are applied inconsistently, tax is recalculated from scratch every month, and
the previous month's figures become unreproducible once a salary changes. The same spreadsheet is
visible to everyone, so salary confidentiality depends on file permissions.

The project set out to replace that with one system that is:

1. **Correct** — one definition of paid days, overtime and tax, used by both the payslip and the reports.
2. **Auditable** — paid amounts are stored as snapshots, not recomputed later.
3. **Access-controlled** — staff manage the organisation; employees see only themselves.
4. **Queryable** — attendance, payroll and compliance reports are answered from indexed SQL, not exports.
5. **Usable** — a responsive web client that works on a phone for daily attendance.

---

## 3. Architecture

The system is deliberately thin above the database.

```
React 19 + TypeScript (Vite)
   │  JSON · Bearer session token
Node.js API (node:http + node:sqlite, no framework)
   │  prepared SQL statements, explicit transactions
SQLite
   schema → procedures → triggers → seed → security → reports
```

| Layer | Responsibility | Key artefacts |
|---|---|---|
| Presentation | role-aware routes, month selection, forms, charts, exports | `src/pages`, `src/components`, `src/contexts` |
| API | authentication, validation, RBAC checks, transaction boundaries, HTTP semantics | `server/http.js`, `server/routes/*` |
| Data | constraints, derived figures, authorisation views, report views | `database/*.sql` |

Running the API with no framework was a deliberate constraint: it keeps the project focused on the
database and makes the SQL boundary visible. The client has a single typed API module
(`src/lib/api.ts`), so every request goes through one place that attaches the session token, normalises
errors and reacts to `401` by clearing the session.

---

## 4. Data model

Five core entities, normalised to 3NF:

| Entity | Purpose | Notable design choice |
|---|---|---|
| `Employee` | workforce directory and taxonomy | surrogate key, unique email, `system_role` for access tier |
| `Salary` | contracted compensation | effective-dated revisions; history is never overwritten |
| `Attendance` | daily time tracking | one row per employee per date (unique constraint); derived hours, overtime, late minutes |
| `Leave` | leave workflow | date range, type (paid/unpaid), approval state; unpaid leave feeds payroll as absence |
| `Payroll` | periodic disbursement | stores the computed gross, deductions, tax and net **as paid**; status transitions guarded by triggers |

Supporting tables add identity (`AuthUser`, `Session`, `SessionContext`) and RBAC (`Role`, `Permission`,
`RolePermission`, `UserRole`).

Two modelling decisions carry most of the weight:

- **Snapshotting money.** `Payroll` records the amounts actually paid. Recomputing an old payslip from
  today's salary would silently rewrite history; the snapshot makes the ledger stable.
- **Separating the salary structure from the payslip.** A raise changes `Salary` from its effective
  date; it does not touch past `Payroll` rows. The procedure always reads the structure that was in
  force for the period.

The full data dictionary, keys and the 3NF argument are in `docs/phase-1/schema-design.md`.

---

## 5. Procedural logic

### 5.1 Salary computation

For a period, the engine:

1. resolves the salary structure in force for the employee and period;
2. derives effective paid days from attendance — present + 0.5 × half day + paid leave;
3. pro-rates basic, HRA and allowances over the period's working days;
4. adds overtime at the configured multiplier;
5. deducts unpaid leave (approved unpaid leave is treated as absence);
6. applies slab-based tax to the taxable gross;
7. writes gross, tax, deductions and net into `Payroll` in one transaction.

The same view (`vw_payroll_procedural_computation`) feeds the payroll screen, the payslip and the reports,
so the number on a payslip cannot disagree with the number in the department rollup.

### 5.2 Triggers and constraints

| Rule | Enforced by |
|---|---|
| No duplicate attendance for one employee and date | unique constraint |
| No future-dated attendance | trigger |
| No overtime on an ABSENT day | trigger |
| Overtime cannot exceed hours worked | trigger |
| A check-in after 09:30 is late, minutes recorded; correcting it clears the mark | trigger |
| Payroll rows start in DRAFT and follow legal status transitions | trigger |
| Attendance cannot overlap an approved leave period | trigger |
| Statuses and roles restricted to known values | CHECK constraints |

Trigger messages are passed through the API verbatim as `400 DB_CONSTRAINT`, so a user sees
"Future date" rather than a generic failure — and the same rule holds for any other SQL client.

### 5.3 Transactions

Multi-row writes are wrapped in explicit transactions: creating an employee writes the employee, the
initial salary structure and the login credential together; running payroll writes every payslip for the
period or none. A failure mid-way leaves no partial payroll.

---

## 6. Reporting layer

Phase 3 added views rather than queries embedded in application code:

| View | Report |
|---|---|
| `vw_rpt_monthly_attendance_summary` | per-employee day breakdown, overtime, late marks, paid days, attendance % |
| `vw_rpt_late_marks` | late register with check-in time and minutes late |
| `vw_rpt_salary_slip` + `vw_rpt_salary_slip_line_items` | payslip header and earnings/deduction lines |
| `vw_rpt_department_rollup` | department totals, paid slips and net payout |
| `vw_rpt_attendance_month_scan` | the indexable month window behind the attendance reports |

### Measured index work

Two report indexes were added and the plans were captured with `EXPLAIN QUERY PLAN` on otherwise
identical databases:

- **Payroll period lookups** moved from `SCAN Payroll` to
  `SEARCH Payroll USING INDEX idx_payroll_period_status (pay_period_year=? AND pay_period_month=? AND status=?)`
  for the payroll list and the "has this period been run?" check.
- **Attendance month windows** already used a Phase 1 index; the new
  `idx_attendance_month_late (attendance_date, is_late, employee_id)` lets the per-employee grouping be
  served from the index as well. The honest conclusion — documented rather than hidden — is that the
  decisive factor is predicate shape: `attendance_date >= '2026-10-01' AND attendance_date < '2026-11-01'`
  is range-searchable, while `substr(attendance_date, 1, 7) = '2026-10'` scans regardless of indexing.
- A bare `is_late = 1` query still scans on both databases; 27 matches out of 1,104 rows is not
  selective enough, which is why the late-marks report is always month-bounded.

---

## 7. Security and access control

### 7.1 Authentication

- Email + password; hash = SHA-256 of `salt || password` with a per-user 16-byte random salt.
- Login mints a 32-byte opaque token; only its SHA-256 digest is stored in `Session`.
- Tokens expire after 12 hours, are revoked on logout, and are rotated on refresh.
- Five failed attempts per email + IP in 15 minutes returns `429`.
- Wrong password, unknown email and deactivated account return the same `401` message.

### 7.2 Authorisation

`Role → RolePermission → Permission` with three roles: ADMIN (18 permissions), HR (17, everything except
employee deletion) and EMPLOYEE (5 self-scoped read permissions plus session self-service).

Reads pass through row-level secure views. Each view resolves the caller from `SessionContext` and
returns **zero rows** when there is no authenticated, active identity. An employee's view of
`vw_secure_payslips` contains only their own slips; a staff member's contains the organisation's.

The API checks permission and ownership **before** looking the row up, so an employee requesting a
colleague's payslip receives `403` and cannot distinguish "not yours" from "does not exist".

### 7.3 Transport and input hardening

- CORS allow-list (loopback dev origins); other origins receive no CORS headers.
- 100 KB body cap, strict field validation, unknown fields rejected with `422`.
- `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` and a deny-all CSP on API responses.
- The browser client ships its own CSP allowing only its own origin, the API origin and font hosts.

### 7.4 Verified security behaviour

`node tests/phase4_security.test.js` (51 tests) covers:

- valid, invalid and boundary credentials, including deactivated accounts and expired sessions;
- every role attempting every permission, including the HR-without-delete boundary;
- employees reading their own rows successfully and other employees' rows with `403`;
- anonymous access returning zero rows from secure views rather than data;
- negative salary, duplicate attendance, overtime above hours worked, future dates and illegal payroll
  transitions rejected with the correct error;
- transaction rollback leaving no partial employee, salary or payroll rows.

---

## 8. Frontend integration

The client was rebuilt against the Phase 1–4 backend; the previous Firebase data layer was removed.

- **Session**: `AuthContext` signs in through `POST /auth/login`, stores the token, restores the session
  with `GET /auth/me`, and clears it on `401` or sign-out.
- **Data**: `AppContext` loads employees, attendance, payroll, dashboard, report and a six-month trend
  for the selected month, and refreshes them after mutations.
- **Roles**: staff routes (`/people`, `/reports`) are wrapped in a `staffOnly` guard; the sidebar,
  bottom navigation and quick actions differ by role. The API enforces the same rules, so a typed URL
  redirects an employee back to their dashboard and a crafted request still returns `403`.
- **Types**: the client's types mirror the API payloads (numeric `employeeId`, `jobTitle`, uppercase
  statuses, snake_case report columns), avoiding an adapter layer that could drift from the contract.
- **Errors**: API error codes are surfaced as readable messages; the login screen explicitly reports an
  unreachable API instead of failing silently.
- **First load**: the demo dataset ends in October 2026, so the first load steps back to the most recent
  month with data; later month choices are never overridden.

### 8.1 Responsive interface and layout conventions

Because attendance is marked daily and payslips are read on whatever device is at hand, the client is
built mobile-first and then constrained at the top end rather than the other way round.

| Concern | Convention |
|---|---|
| Page width | Shell caps content at 1400 px with fluid gutters (`px-4` mobile, `px-6`/`px-8` desktop) |
| Navigation | Sidebar collapses to a bottom tab bar under the `lg` breakpoint; header actions wrap |
| KPI figures | Value font scales with `clamp(1.05rem, 4.6vw, 1.75rem)`; icon is absolutely positioned so it cannot push the number; labels wrap rather than truncate |
| Tables | Numeric columns right-aligned with `tabular-nums`; minimum width applied to the table, scrolled inside its card so the page itself never scrolls sideways |
| Currency | Always two decimals, so ledger columns align digit for digit |
| Charts | `ResponsiveContainer` with `minWidth={0}` inside a `min-w-0` wrapper, so a flex parent cannot starve it of height |

Verification used `document.documentElement.scrollWidth` against the viewport on every route: 320,
375 and 768 px report no horizontal overflow, and at 1440 px no table is clipped or truncated. The
layout defects found in review were all the same bug in different places — a fixed minimum width inside
an unconstrained flex child — which is why the fixes are expressed as conventions above rather than
one-off sizes.

---

## 9. Results

| Suite | Command | Result |
|---|---|---|
| Schema, procedures, triggers, end-to-end | `node tests/run_e2e.js` | 134 / 134 |
| Reporting and query plans | `node tests/run_reports.js` | 46 / 46 |
| Security and RBAC | `node tests/phase4_security.test.js` | 51 / 51 |
| REST API | `node tests/run_api.js` | 94 / 94 |
| Client type-check and production build | `npm run build` (`tsc -b && vite build`) | passes |

Verified figures for October 2026, produced by the running system:

| Metric | Value |
|---|---|
| Employees | 12 across 7 departments |
| Present days | 238 |
| Late marks | 9 |
| Absent / leave / half days | 1 / 12 / 1 |
| Overtime hours | 70 |
| Payslips paid | 12 / 12 |
| Gross payroll | ₹12,31,045.73 |
| Tax withheld | ₹91,115.37 |
| **Net paid** | **₹11,33,930.36** |

Hand-checked spot values: Rajesh Sharma (21 of 22 days, 9 OT hours) gross ₹1,98,068.22, TDS
₹20,960.23, net ₹1,77,107.99; Priya Patel (18 present + 3 paid leave, 10 OT hours) net ₹1,22,872.11, which
is exactly what her employee dashboard shows.

---

## 10. Real-world use cases

### 10.1 Small professional-services firm (20–200 staff)

A CA or law firm with monthly salaries, paid leave and overtime billed to clients. HR marks attendance
daily, including leave days; at month end payroll is run and every payslip is generated from
the same computation. The department rollup gives partners a cost view without exporting to Excel, and
the employee portal removes the "please send me my payslip" email traffic. The unpaid-leave rule matters
here: an approved *unpaid* day reduces pay, while casual leave does not, and the system distinguishes
them without a manual adjustment column.

### 10.2 Multi-outlet retail or hospitality

Attendance is the core record: staff clock in per shift, lateness is measured in minutes, and half days
are common. PayTrack's late-mark register gives area managers a monthly list of repeated lateness, and
the trigger that rejects duplicate attendance prevents the double-entry that inflates hours when two
supervisors both mark the same shift. Row-level security keeps salary data out of outlet-level accounts:
a store manager can be given an EMPLOYEE login that sees only their own record.

### 10.3 Staffing agency and contract payroll

Contract staff are paid for days worked plus overtime, frequently across changing client sites. Because
overtime is validated against hours actually worked, and payroll is written as an immutable snapshot,
each monthly invoice can be reconstructed months later even after the contractor's rate changes. The
period index and payroll status checks keep "has this month been run?" cheap as history accumulates.

### 10.4 University / institution adjunct faculty

Adjunct and visiting faculty are paid per month for days engaged, with honoraria that differ by course.
The effective-dated salary structure handles a rate change mid-year without rewriting prior months, and
department-level rollups map naturally onto academic departments. Administrators can be given HR access
(no deletion) while faculty receive employee self-service.

### 10.5 Compliance and audit readiness

An auditor asks: who was paid what in October, on what attendance, and who approved the leave? PayTrack
answers from `Payroll` snapshots, `Attendance` rows and approved `Leave` records, with the figures the
system actually paid. Access is role-scoped and sessions are short-lived and hashed, so the answer does
not require handing over a spreadsheet containing everyone's salary. Adding an append-only audit table
is the natural next step for a regulated environment.

### 10.6 Internal tooling for a startup

Before dedicated HR software, a 30-person startup needs exactly three things: attendance that staff can
mark from a phone, leave that a founder can approve, and payslips at month end. The responsive UI, the
PWA manifest and the single-command backend make PayTrack deployable as an internal tool, with the
database file as the backup unit.

---

## 11. Deployment and operations

**Local evaluation**

```bash
npm install
node server/index.js          # API on 127.0.0.1:4000
npm run dev                   # client on 127.0.0.1:5173
```

**Production shape for a small organisation**

- API on a private host behind a reverse proxy with TLS; the client served as static files from a CDN.
- SQLite file on a persistent volume, with scheduled copies and a tested restore; move to PostgreSQL
  before running multiple API instances.
- Session lifetime (12 h), login throttling, CORS origins and the client CSP reviewed for the real
  domain; demo accounts removed or rotated.
- Nightly logical backup plus a monthly restore drill; payroll runs recorded in an operations log.

**Operational checks**: payroll run success per period, failed logins per account, late-mark counts
trending unexpectedly, and API error rate. All are answerable from existing tables.

---

## 12. Scaling roadmap

| Stage | Trigger | Change |
|---|---|---|
| 1. Harden single node | first real users | TLS, backups, rotate demo accounts, audit log |
| 2. Move database | concurrent writers, > ~50k attendance rows | PostgreSQL, connection pooling, RLS replacing `SessionContext` |
| 3. Partition attendance | multi-year history | monthly partitions, archive cold periods, keep reports month-bounded |
| 4. Precompute reports | report latency grows | materialised views or nightly aggregates refreshed after payroll |
| 5. Scale API | request concurrency | stateless replicas behind a balancer, shared session store, queue for payroll/exports |
| 6. Multi-tenant | SaaS offering | `organisation_id` + RLS, per-tenant isolation tests, tenant-aware backups |
| 7. Integrations | finance/HR ecosystem | bank disbursement files, accounting export, SSO, statutory filing adapters |

The design decisions that make this roadmap cheap are already in place: money is computed in one place,
the month is expressed as a range, authorisation is data-driven, and the API is stateless apart from
sessions.

---

## 13. Limitations

- SQLite serialises writers; one API process is assumed.
- Statutory deductions (PF, ESI, professional tax) and bank disbursement files are out of scope.
- Tax slabs are configuration in SQL, not a jurisdiction-complete tax engine.
- CSV exports (directory, payroll, payslip) are generated client-side; there is no server-side PDF or
export job.
- No email delivery, password reset or MFA.
- Firebase packages remain installed from the original client but are unused by the current app.

---

## 14. Conclusion

PayTrack meets the five phase objectives with a single, consistent definition of payroll truth. The
schema is normalised and stable; the procedures and triggers make invalid states unrepresentable; the
reports are served by indexed views with documented plans; access control is enforced in the database
through RBAC and row-level views, not just in the UI; and the React client is fully role-based and
connected to the real backend.

The result is small enough to read end to end — one schema, one API, one client — while demonstrating
the parts of database engineering that matter in production: constraints over conventions, snapshots
over recomputation, authorisation at the data boundary, and measured query plans over assumed ones.

---

## Appendix — demo accounts

| Role | Email | Password |
|---|---|---|
| ADMIN | `rajesh.sharma@paytrack.internal` | `Admin@123` |
| HR | `sunita.rao@paytrack.internal` | `Hr@12345` |
| EMPLOYEE | `priya.patel@paytrack.internal` | `Employee@123` |

Seed data covers August–October 2026; the client opens October 2026 on first sign-in.
