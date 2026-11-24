# PayTrack — Phase 5: REST API Reference

| | |
|---|---|
| Candidate | Vinayak |
| Roll Number | 2501730150 |
| Course | Database Management Systems (Capstone Phase 5) |
| Runtime | Node.js v24 (no framework, no npm runtime dependency; `node:http` + `node:sqlite`) |
| Entry point | `node server/index.js` — `http://127.0.0.1:4000/api` |
| Test suite | `node test/run_api.js` — 94 / 94 passing |

The server is a thin HTTP layer over the database built by `schema.sql → procedures.sql →
triggers.sql → seed.sql → security.sql → reports.sql`. Business rules stay in SQL (triggers, views and
CHECK constraints); the API validates input, applies role checks and maps database outcomes onto HTTP
status codes.

---

## 1. Running it

```bash
node server/index.js                      # port 4000, database/paytrack.sqlite
PORT=0 node server/index.js                # pick a free port
PAYTRACK_DB_PATH=/tmp/paytrack.sqlite node server/index.js
```

`PORT=0` prints the actual bound port. The listener binds `127.0.0.1` only.

On first start the server builds the database in place, applies every `database/*.sql` file that
exists, then creates `AuthUser`/`Session` and seeds one login per employee. Initialisation is
idempotent: restarting does not duplicate rows, and an already-populated database is never re-seeded.

### Demo accounts

| Email | Password | Role |
|---|---|---|
| `rajesh.sharma@paytrack.internal` | `Admin@123` | ADMIN |
| `sunita.rao@paytrack.internal` | `Hr@12345` | HR |
| `priya.patel@paytrack.internal` | `Employee@123` | EMPLOYEE |
| other seeded employees | `Employee@123` | EMPLOYEE |

Only a SHA-256 digest of `salt || password` is stored, with a per-user random salt. No endpoint ever
returns `password_hash`, `salt` or a session digest.

`package.json` does not wire this into `npm run dev` (that stays Vite); start the API with
`node server/index.js` alongside the frontend.

---

## 2. Conventions

- Base URL: `http://127.0.0.1:4000/api`. JSON in, JSON out.
- Success envelope: `{ "data": <payload> }` (any 2xx).
- Error envelope: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.
- Auth: `Authorization: Bearer <token>`. Tokens are opaque 32-byte hex strings minted by login and
  stored as SHA-256 digests in `Session`. Lifetime is 12 hours.
- Roles: `ADMIN` and `HR` share **staff** access; `EMPLOYEE` is read-only and scoped to its own
  `employeeId`. `DELETE /employees/:id` is ADMIN-only.
- A request with no token is `401`; a malformed, revoked or expired token is also `401`.
- `403` is decided **before** the row lookup, so "not yours" and "does not exist" are indistinguishable
  to an employee.
- Unknown request fields are rejected with `422` rather than silently ignored.
- Every response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and a deny-all CSP.
- CORS is allow-listed to `http://localhost:5173` and `http://localhost:4173`; other origins receive no
  CORS headers.

### Status codes

| HTTP | Code | When |
|---|---|---|
| 400 | `DB_CONSTRAINT` | a CHECK/UNIQUE/trigger abort; trigger messages are passed through verbatim |
| 401 | `UNAUTHENTICATED` | missing/invalid/revoked/expired token, bad credentials |
| 403 | `FORBIDDEN` | role or ownership violation |
| 404 | `NOT_FOUND` | unknown route, method or row |
| 409 | `CONFLICT` | duplicate attendance, recalculating a closed payroll period |
| 413 | `PAYLOAD_TOO_LARGE` | request body over 100 KB |
| 422 | `VALIDATION_ERROR` | malformed body/query, illegal state transition |
| 429 | `RATE_LIMITED` | more than 5 login/exchange attempts per email+IP in 15 minutes |
| 500 | `INTERNAL` | unexpected failure; message is never leaked |

List of trigger messages that surface as `400`: `Future date`, `ABSENT employee`, `Overtime hours cannot
exceed total hours worked`, `New payroll rows must start in DRAFT status`, `Illegal payroll status
transition`, `Payroll row is not in DRAFT`, `Sessions can only be issued to active users`.

---

## 3. Authentication

### `POST /auth/login` — public

```json
{ "email": "priya.patel@paytrack.internal", "password": "Employee@123" }
```

```json
{
  "data": {
    "token": "9f2c…",
    "tokenType": "Bearer",
    "expiresAt": "2026-11-25T04:41:00.000Z",
    "user": {
      "employeeId": 2,
      "email": "priya.patel@paytrack.internal",
      "firstName": "Priya",
      "lastName": "Patel",
      "fullName": "Priya Patel",
      "phone": "…",
      "department": "Engineering",
      "jobTitle": "Senior Backend Engineer",
      "systemRole": "EMPLOYEE",
      "roles": ["EMPLOYEE"],
      "isStaff": false,
      "employeeStatus": "ACTIVE",
      "joinDate": "…",
      "lastLoginAt": "…",
      "permissions": ["attendance:read:self", "auth:session:self", "…"]
    }
  }
}
```

Wrong password, unknown email and an inactive account all return the same `401` message
(`Invalid email or password`). Five failures per email+IP in 15 minutes return `429`.

### `GET /auth/me` — any
Returns `{ "data": { "user": <same user object> } }`.

### `POST /auth/logout` — any
Revokes the presented token only. `{ "data": { "loggedOut": true } }`.

### `POST /auth/session` — public
Firebase hand-off used by the browser build: `{ email, idToken? }`. Answers like login for a known,
active account and `403` otherwise. **The demo build trusts `email`; a production deployment must
verify the Firebase ID token server-side before calling this lookup.**

### `POST /auth/session/refresh` — any
Rotates the session: mints a new token and revokes the presented one in one write lock. Same body as
login.

---

## 4. Employees

### `GET /employees?search=&department=&status=` — any

Staff see the whole directory; an `EMPLOYEE` is forced to their own row regardless of filters.

```json
{ "data": { "employees": [ { "employeeId": 1, "firstName": "Rajesh", "fullName": "Rajesh Sharma",
  "email": "…", "phone": "…", "department": "Engineering", "jobTitle": "Lead Systems Architect",
  "systemRole": "ADMIN", "joinDate": "…", "status": "ACTIVE", "createdAt": "…", "updatedAt": "…" } ] } }
```

`search` matches first name, last name or email (case-insensitive, `%` and `_` escaped). An unknown
`status` is `422`.

### `GET /employees/:id` — staff or self
`{ "data": { "employee": { … } } }`. Non-numeric id is `404`.

### `POST /employees` — staff

```json
{ "firstName": "Asha", "lastName": "Menon", "email": "asha.menon@paytrack.internal",
  "phone": "+91…", "department": "Product", "role": "Product Manager",
  "systemRole": "EMPLOYEE", "joinDate": "2026-11-01", "status": "ACTIVE",
  "baseSalary": 70000, "hra": 17500, "allowances": 8000, "effectiveDate": "2026-11-01" }
```

`201` with `{ "data": { "employee": … } }`. The employee and its active `Salary` row are written in one
`BEGIN IMMEDIATE`; a failure writes neither. Negative salary is `422`; a duplicate email is
`400 DB_CONSTRAINT`. A login is provisioned with `Employee@123` when the credential policy allows it.

### `PATCH /employees/:id` — staff
Any subset of the employee fields. Returns the updated employee. Unknown field or bad enum is `422`,
missing row `404`.

### `DELETE /employees/:id` — ADMIN only
`{ "data": { "deleted": true, "employeeId": 4 } }`. Salary, attendance, payroll, credentials and
sessions cascade from the foreign keys. Deleting yourself is `403`.

---

## 5. Attendance

### `GET /attendance?month=YYYY-MM&employeeId=` — any

Staff read the organisation (optionally one employee); an `EMPLOYEE` is forced to self and the
`employeeId` parameter is ignored. `month` defaults to the current month.

```json
{ "data": { "month": "2026-10", "attendance": [ {
  "attendanceId": 1, "employeeId": 1, "employeeName": "Rajesh Sharma", "department": "Engineering",
  "date": "2026-10-01", "status": "PRESENT", "checkInTime": "09:12:00", "checkOutTime": "18:05:00",
  "hoursWorked": 8.88, "overtimeHours": 0, "isLate": false, "lateMinutes": 0 } ] } }
```

### `GET /employees/:id/attendance?month=YYYY-MM` — staff or self
`{ "data": { "month": "2026-10", "employeeId": 1, "attendance": [ … ] } }`. Another employee's id is
`403` for an `EMPLOYEE`; an unknown id is `404` for staff.

### `POST /attendance` — staff

```json
{ "employeeId": 2, "date": "2026-11-02", "status": "PRESENT",
  "checkInTime": "09:42", "checkOutTime": "18:00" }
```

`201` with the created row. `hoursWorked` is derived from the punches when omitted; `overtimeHours`
defaults to `0`. Duplicate `(employee, date)` is `409 CONFLICT`. The Phase 2 triggers still apply:
future date `400`, overtime on `ABSENT` `400`, overtime above hours worked `400`, and a punch after
`09:30:00` is auto-marked late.

### `PATCH /attendance/:id` — staff
Any of `status`, `checkInTime`, `checkOutTime`, `hoursWorked`, `overtimeHours`. Correcting a punch back
to `09:30:00` or earlier clears the late mark (`isLate: false`, `lateMinutes: 0`). `404` for a missing
row.

### `GET /attendance/summary?month=YYYY-MM` — staff
Monthly per-employee breakdown from `vw_employee_attendance_monthly_summary`:

```json
{ "data": { "month": "2026-10", "attendance": [ {
  "employee_id": 1, "employee_name": "Rajesh Sharma", "department": "Engineering",
  "role": "Lead Systems Architect", "month_key": "2026-10", "total_logged_days": 31,
  "present_days": 21, "half_days": 0, "leave_days": 0, "absent_days": 0, "holiday_days": 10,
  "total_overtime_hours": 9, "total_late_marks": 1 } ] } }
```

### `GET /attendance/late?month=YYYY-MM` — staff
Late punches for the month from `vw_rpt_late_marks` (falls back to a month-bounded base-table query if
`reports.sql` is absent):

```json
{ "data": { "month": "2026-10", "lateMarks": [ {
  "attendance_id": 213, "employee_id": 9, "employee_name": "Kavita Nair", "department": "Product",
  "attendance_date": "2026-10-06", "day_of_week_name": "Tuesday",
  "check_in_time": "09:50:00", "late_minutes": 20 } ] } }
```

A well-formed month with no data returns empty arrays, never an error.

---

## 6. Payroll

### `POST /payroll/generate` — staff

`{ "month": "2026-09" }`

```json
{ "data": { "month": "2026-09", "generated": 12, "recalculated": 0,
  "computedFrom": "vw_payroll_procedural_computation", "payroll": [ … ] } }
```

- The batch runs inside one `BEGIN IMMEDIATE`; any failure rolls back every row.
- Only `DRAFT` periods can be regenerated. If any slip in the period is `APPROVED` or `PAID`, the
  request is `409` before anything is written and the frozen rows are never touched.
- Regenerating an all-`DRAFT` period updates the existing rows in place (no duplicates).
- `422` for a malformed month or a period with no attendance data.
- Figures are copied from the Phase 2 computation view, so the API cannot disagree with the database.

### `GET /payroll?month=YYYY-MM&status=` — staff

```json
{ "data": { "month": "2026-10", "payroll": [ {
  "payrollId": 25, "employeeId": 1, "employeeName": "Rajesh Sharma", "email": "…",
  "department": "Engineering", "month": "2026-10", "workingDays": 22, "presentDays": 21,
  "absentDays": 0, "halfDays": 0, "leaveDays": 0, "overtimeHours": 9,
  "grossSalary": 198068.22, "taxDeduction": 20960.23, "unpaidLeaveDeduction": 0,
  "otherDeductions": 0, "netSalary": 177107.99, "status": "PAID",
  "paymentDate": "2026-10-31", "createdAt": "…", "updatedAt": "…" } ],
  "totals": { "grossSalary": 1231045.73, "netSalary": 1133930.36, "taxDeduction": 91115.37 } } }
```

### `GET /payroll/me?month=YYYY-MM` — any
The caller's own slips only, staff included. `{ "data": { "month", "payroll": [ … ] } }`.

### `GET /payroll/:id/payslip` — staff or owner

```json
{ "data": { "payslip": {
  "payrollId": 25,
  "employee": { "employeeId": 1, "fullName": "Rajesh Sharma", "email": "…",
                "department": "Engineering", "jobTitle": "Lead Systems Architect" },
  "month": "2026-10", "periodLabel": "October 2026", "status": "PAID", "paymentDate": "2026-10-31",
  "salaryPackage": { "salaryId": 1, "baseSalary": 140000, "hra": 40000, "allowances": 20000 },
  "attendance": { "workingDays": 22, "presentDays": 21, "halfDays": 0, "leaveDays": 0,
                  "absentDays": 0, "overtimeHours": 9 },
  "earnings": { "baseSalaryEarned": 133636.44, "allowancesEarned": 57272.73,
                "overtimePay": 7159.05, "grossSalary": 198068.22 },
  "deductions": { "taxDeduction": 20960.23, "unpaidLeaveDeduction": 0, "otherDeductions": 0,
                  "totalDeductions": 20960.23 },
  "netSalary": 177107.99, "computedNetSalary": 177107.99,
  "lineItems": [
    { "sortOrder": 10, "itemType": "EARNING", "code": "BASE_SALARY",
      "label": "Base Salary (Prorated)", "amount": 133636.44 },
    { "sortOrder": 20, "itemType": "EARNING", "code": "HRA_AND_ALLOWANCES",
      "label": "HRA + Allowances (Prorated)", "amount": 57272.73 },
    { "sortOrder": 30, "itemType": "EARNING", "code": "OVERTIME", "label": "Overtime Pay",
      "amount": 7159.05 },
    { "sortOrder": 40, "itemType": "DEDUCTION", "code": "TAX_TDS",
      "label": "Income Tax (TDS, progressive slabs)", "amount": 20960.23 },
    { "sortOrder": 50, "itemType": "DEDUCTION", "code": "UNPAID_LEAVE",
      "label": "Unpaid Leave Deduction", "amount": 0 },
    { "sortOrder": 60, "itemType": "DEDUCTION", "code": "OTHER", "label": "Other Deductions",
      "amount": 0 } ],
  "generatedAt": "…" } } }
```

The slip joins `Payroll.salary_id → Salary.salary_id`, so a later salary revision does not rewrite a
historical payslip. An employee asking for another employee's slip gets `403` with the same message for
an existing and a missing id; staff get `404` for a missing id.

### `PATCH /payroll/:id/status` — staff

`{ "status": "APPROVED" }` then `{ "status": "PAID", "paymentDate": "2026-10-31" }`.

```json
{ "data": { "payrollId": 49, "status": "PAID", "paymentDate": "2026-10-31" } }
```

Only `DRAFT → APPROVED` and `APPROVED → PAID` are legal; anything else (including a same-status change)
is `422`. Marking `PAID` without a date uses today. The database trigger enforces the same rule even if
the route is bypassed.

---

## 7. Reports and dashboard

### `GET /reports/monthly?month=YYYY-MM` — staff

```json
{ "data": { "month": "2026-10",
  "departments": [ {
    "department": "Engineering", "month_key": "2026-10", "employees_logged": 4,
    "present_days": 81, "half_days": 0, "leave_days": 3, "absent_days": 0, "holiday_days": 40,
    "overtime_hours": 40, "late_marks": 2, "avg_attendance_percentage": 99.4,
    "payroll_slips": 4, "paid_slips": 4, "paid_gross_salary": 527687.6,
    "paid_tax_deduction": 44588.36, "paid_net_salary": 483099.24 } ],
  "totals": { "presentDays": 238, "absentDays": 3, "leaveDays": 10, "lateMarks": 9,
              "overtimeHours": 61,
              "payroll": { "slips": 12, "draft": 0, "approved": 0, "paid": 12,
                           "grossSalary": 1231045.73, "taxDeduction": 91115.37,
                           "netSalary": 1133930.36 } } } }
```

`payroll.slips > payroll.paid + payroll.approved + payroll.draft` cannot happen; a partly processed
month is visible as fewer `paid` slips, and `totals.payroll.*` is computed directly from `Payroll` so it
cannot double count.

### `GET /me/dashboard?month=YYYY-MM` — any

```json
{ "data": { "scope": "SELF", "month": "2026-10", "headcount": 1, "employeesLogged": 1,
  "attendance": { "presentDays": 18, "absentDays": 0, "leaveDays": 3, "halfDays": 0,
                  "lateMarks": 1, "overtimeHours": 10 },
  "payroll": { "slips": 1, "paidSlips": 1, "paidNetSalary": 128088.01 } } }
```

For staff the same route reports `scope: "ORG"` with org-wide figures plus `departments` (the number of
distinct departments).

---

## 8. Security notes

- Role checks run before any row read, so `403` never reveals existence.
- Employee scope is applied in the `WHERE` clause, never by trusting a query parameter.
- SQL is always parameterised. Identifiers interpolated into SQL come from the server's own column
  constants, never from a request.
- Responses are assembled by explicit column selection, so a future column cannot leak by `SELECT *`.
- Login uses constant-time hash comparison and one generic message for every credential failure.
- Rate limiting is a fixed window of 5 attempts / 15 minutes per `email+IP`, held in process memory
  (per-instance; behind several replicas the effective limit multiplies).
- Request bodies are capped at 100 KB and must be a JSON object; arrays and malformed JSON are `422`.

---

## 9. Verification

`node test/run_api.js` starts a server on an ephemeral port over a fresh in-memory database and drives
every endpoint with native `fetch`, one test per contract statement:

| Group | Cases | Covers |
|---|---|---|
| A | `T5-A01…A22` | login, wrong/unknown credentials, hashed storage, sessions, logout, rotation, rate limit, inactive accounts |
| E | `T5-E01…E22` | directory listing and scoping, search/filter, CRUD, atomic create, cascade delete, ADMIN-only delete |
| AT | `T5-AT01…AT19` | month listing, scoping, create/derive hours, duplicate, trigger aborts, late mark reset, summary and late reports |
| P | `T5-P01…P16` | generate, recompute, closed periods, listing, own slips, payslip ownership, state machine, rollback |
| R | `T5-R01…R05` | department rollup, staff-only access, empty month, dashboard scope |
| T | `T5-T01…T08` | CORS, body cap, malformed JSON, security headers, unknown routes, 401 handling |
| B | `T5-B01` | idempotent initialisation and the views both suites need |

Measured result: **94 / 94**, exit code 0. Phase 3 (`node test/run_reports.js`) remains 46/46 and the
end-to-end database suite (`node test/run_e2e.js`) remains 134/134.

Not verified here: the React frontend is not exercised by this suite, and no load/soak timing is
claimed. Rate limiting is asserted within one process, which is what a single-instance deployment runs.
