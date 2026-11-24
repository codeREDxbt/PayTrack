# PayTrack — Phase 3: Query & Report Development

| | |
|---|---|
| Candidate | Vinayak |
| Roll Number | 2501730150 |
| Course | Database Management Systems (Capstone Phase 3) |
| Engine | SQLite 3.51.3 via Node.js v24.15.0 `node:sqlite` (`DatabaseSync`) |
| Database | `database/paytrack.sqlite`, built from `schema.sql` → `procedures.sql` → `triggers.sql` → `seed.sql` → `reports.sql` |
| Suite | `node tests/run_reports.js` — 46 / 46 passing |
| Regression | `node tests/run_e2e.js` — 134 / 134 passing (unchanged) |

Every result table and every `EXPLAIN QUERY PLAN` block in this document was captured by running the SQL against the seeded database; nothing here is illustrative. The numbers were hand-checked against the seed rows before they were trusted (Section 2.3).

---

## 1. Scope

Phase 3 turns the normalised schema (Phase 1) and the procedural layer (Phase 2) into the **reporting layer** the REST API in Phase 5 will expose. It delivers:

| Object | Type | Serves |
|---|---|---|
| `vw_rpt_monthly_attendance_summary` | view | `GET /attendance/summary?month=` |
| `vw_rpt_late_marks` | view | `GET /attendance/late?month=` |
| `vw_rpt_salary_slip` | view | `GET /payroll/:id/payslip` |
| `vw_rpt_salary_slip_line_items` | view | `GET /payroll/:id/payslip` (line items) |
| `vw_rpt_department_rollup` | view | `GET /reports/monthly?month=` |
| `vw_rpt_attendance_month_scan` | view | the indexable month window behind the attendance reports |
| `idx_attendance_month_late` | index | month-scoped attendance reads |
| `idx_payroll_period_status` | index | period-scoped payroll reads |

Nothing in Phase 1 or Phase 2 was modified: `schema.sql`, `procedures.sql`, `triggers.sql` and `seed.sql` are byte-for-byte untouched, and the 134-test end-to-end suite still passes.

### 1.1 Data the reports run against

| Fact | Value (verified by query) |
|---|---|
| Employees | 12 across 7 departments |
| Attendance rows | 1,104 (372 in Aug, 360 in Sep, 372 in Oct 2026) |
| Attendance status split | PRESENT 722, HOLIDAY 336, ON_LEAVE 40, ABSENT 3, HALF_DAY 3 |
| Late punches (`is_late = 1`) | 27 (7 in Aug, 11 in Sep, 9 in Oct) |
| Payroll slips | 36 (12 per month, all status `PAID`) |
| Approved leave records | 22 |

---

## 2. The reports

### 2.1 Monthly attendance summary — `vw_rpt_monthly_attendance_summary`

**Purpose.** One row per (employee, calendar month) with the day-type breakdown, overtime, late marks, an effective paid-days figure and an attendance percentage. This is the report the HR screen shows and the same numbers the payroll engine bills from.

**Day semantics.** These are deliberately identical to the Phase 2 view `vw_employee_attendance_monthly_summary` so the report and the payroll engine can never disagree (asserted by test `RPT-029`, which joins both views over all 36 employee-months and requires zero differences):

| Column | Meaning |
|---|---|
| `present_days` | `status = 'PRESENT'` |
| `half_days` | `status = 'HALF_DAY'` — counted as rows; worth 0.5 each |
| `leave_days` | `status = 'ON_LEAVE'` **not** inside an APPROVED `UNPAID` leave |
| `absent_days` | `status = 'ABSENT'` **plus** `ON_LEAVE` rows inside an APPROVED `UNPAID` leave |
| `holiday_days` | `status = 'HOLIDAY'` (week-ends) |
| `overtime_hours` | `SUM(overtime_hours)` |
| `late_marks` | `SUM(is_late)` — as set by the Phase 2 late-mark triggers |
| `effective_paid_days` | `present + 0.5 × half + leave` |
| `attendance_percentage` | `effective_paid_days / (logged_days − holiday_days) × 100`, `NULL` when the month has no working days |

The unpaid-leave rule is tested from both sides in the seed: Amit Verma's 21–22 Sep leave is `UNPAID` and lands in `absent_days`, while Pooja Deshmukh's 10–11 Sep leave is `CASUAL` and lands in `leave_days`.

**Real output — October 2026** (`SELECT ... FROM vw_rpt_monthly_attendance_summary WHERE month_key='2026-10' ORDER BY department, employee_id`):

| employee_id | employee_name | department | present_days | half_days | leave_days | absent_days | holiday_days | overtime_hours | late_marks | effective_paid_days | attendance_percentage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rajesh Sharma | Engineering | 21 | 0 | 0 | 0 | 10 | 9 | 1 | 21 | 100 |
| 2 | Priya Patel | Engineering | 18 | 0 | 3 | 0 | 10 | 10 | 1 | 21 | 100 |
| 3 | Amit Verma | Engineering | 21 | 0 | 0 | 0 | 10 | 9 | 0 | 21 | 100 |
| 4 | Neha Singh | Engineering | 21 | 0 | 0 | 0 | 10 | 12 | 0 | 21 | 100 |
| 7 | Ananya Iyer | Finance | 19 | 0 | 2 | 0 | 10 | 9 | 0 | 21 | 100 |
| 8 | Rohan Gupta | Finance | 20 | 0 | 0 | 1 | 10 | 12 | 1 | 20 | 95.24 |
| 5 | Sunita Rao | Human Resources | 18 | 0 | 3 | 0 | 10 | 0 | 0 | 21 | 100 |
| 6 | Vikram Malhotra | Human Resources | 20 | 1 | 0 | 0 | 10 | 0 | 1 | 20.5 | 97.62 |
| 10 | Siddharth Joshi | Marketing | 19 | 0 | 2 | 0 | 10 | 0 | 1 | 21 | 100 |
| 12 | Manoj Kumar | Operations | 21 | 0 | 0 | 0 | 10 | 0 | 1 | 21 | 100 |
| 9 | Kavita Nair | Product | 21 | 0 | 0 | 0 | 10 | 0 | 2 | 21 | 100 |
| 11 | Pooja Deshmukh | Sales | 19 | 0 | 0 | 2 | 10 | 9 | 1 | 19 | 90.48 |

**September 2026, the two interesting employees:**

| employee_id | employee_name | present_days | absent_days | leave_days | holiday_days | overtime_hours | late_marks | attendance_percentage |
|---|---|---|---|---|---|---|---|---|
| 3 | Amit Verma | 20 | 2 | 0 | 8 | 7.5 | 2 | 90.91 |
| 11 | Pooja Deshmukh | 20 | 0 | 2 | 8 | 7.5 | 1 | 100 |

### 2.2 Late marks — `vw_rpt_late_marks`

**Purpose.** Every late punch with employee identity and calendar context, filtered by month in the API. Lateness is not recomputed from clock times here — the Phase 2 triggers (`trg_auto_late_mark_*`) own that decision, so the report shows exactly what the engine recorded.

**Real output — October 2026:**

| attendance_date | day_of_week_name | employee_id | employee_name | department | check_in_time | late_minutes |
|---|---|---|---|---|---|---|
| 2026-10-06 | Tuesday | 9 | Kavita Nair | Product | 09:50:00 | 20 |
| 2026-10-08 | Thursday | 12 | Manoj Kumar | Operations | 09:55:00 | 25 |
| 2026-10-09 | Friday | 2 | Priya Patel | Engineering | 09:46:00 | 16 |
| 2026-10-13 | Tuesday | 8 | Rohan Gupta | Finance | 09:56:00 | 26 |
| 2026-10-15 | Thursday | 11 | Pooja Deshmukh | Sales | 10:01:00 | 31 |
| 2026-10-16 | Friday | 1 | Rajesh Sharma | Engineering | 09:52:00 | 22 |
| 2026-10-22 | Thursday | 10 | Siddharth Joshi | Marketing | 10:07:00 | 37 |
| 2026-10-27 | Tuesday | 6 | Vikram Malhotra | Human Resources | 10:08:00 | 38 |
| 2026-10-29 | Thursday | 9 | Kavita Nair | Product | 09:38:00 | 8 |

**Aggregated by month:**

| month_key | late_marks | total_minutes | avg_minutes |
|---|---|---|---|
| 2026-08 | 7 | 160 | 22.86 |
| 2026-09 | 11 | 245 | 22.27 |
| 2026-10 | 9 | 223 | 24.78 |

### 2.3 Salary slip — `vw_rpt_salary_slip` and `vw_rpt_salary_slip_line_items`

**Purpose.** `vw_rpt_salary_slip` joins each `Payroll` row to its `Employee` and to the **salary package the slip was computed from** (`Salary.salary_id = Payroll.salary_id`, not the currently active package). A payslip must remain reproducible after a salary revision; test `RPT-053` inserts a newer, active package for an employee inside a rolled-back transaction and confirms the historical slip still reads its original `base_salary`. `vw_rpt_salary_slip_line_items` breaks the slip into six ordered line items (three earnings, three deductions) — the shape the React payslip component renders.

**Hand-checked payslip — `payroll_id = 25`, Rajesh Sharma, October 2026.**

| Field | Value | Hand check |
|---|---|---|
| base_salary / HRA / allowances | 140000 / 40000 / 20000 | seed `Salary` id 1 |
| present_days / working_days | 21 / 22 | seed `Payroll` id 25 |
| daily rate | 6363.64 | `140000 / 22` |
| hourly rate | 795.45 | `140000 / (22 × 8)` |
| base_salary_earned | 133636.44 | `21 × 6363.64` |
| allowances_earned | 57272.73 | `60000 × 21/22` |
| overtime_pay | 7159.05 | `9 × 795.45` |
| gross_salary | 198068.22 | sum of the three earnings |
| tax_deduction | 20960.23 | `6250 + (198068.22 − 100000) × 0.15` |
| unpaid_leave_deduction | 0.00 | no absent days |
| net_salary | 177107.99 | `198068.22 − 20960.23` |

**Line items:**

| sort_order | item_type | item_label | amount |
|---|---|---|---|
| 10 | EARNING | Base Salary (Prorated) | 133636.44 |
| 20 | EARNING | HRA + Allowances (Prorated) | 57272.73 |
| 30 | EARNING | Overtime Pay | 7159.05 |
| 40 | DEDUCTION | Income Tax (TDS, progressive slabs) | 20960.23 |
| 50 | DEDUCTION | Unpaid Leave Deduction | 0 |
| 60 | DEDUCTION | Other Deductions | 0 |

A slip where the deduction is **not** zero — `payroll_id = 15`, Amit Verma, September 2026 (his unpaid leave of 21–22 Sep):

| payroll_id | employee_name | period_label | gross_salary | tax_deduction | unpaid_leave_deduction | net_salary |
|---|---|---|---|---|---|---|
| 15 | Amit Verma | September 2026 | 98650.58 | 6115.06 | 6818.18 | 85717.34 |

Across all 36 slips, `gross − tax − unpaid leave − other = net` holds to the paise (`RPT-052`), and the six line items sum back to the gross and net (`RPT-054`).

> Implementation note: the `DECIMAL` columns are stored as SQLite `REAL`. An unrounded subtraction lands on values such as `123789.70999999999`, so the view rounds `computed_net_salary` to two decimals. The check is in paise, so this is the correct comparison, not a fudge.

### 2.4 Department rollup — `vw_rpt_department_rollup`

**Purpose.** Per (department, month): attendance totals and headcount from the summary view, plus the payroll totals for that period, with `PAID` and `APPROVED` (not yet paid) net kept separate so a period that is only half-paid is visible rather than silently averaged.

**Real output — October 2026:**

| department | employees_logged | present_days | leave_days | absent_days | late_marks | overtime_hours | paid_slips | paid_gross_salary | paid_tax_deduction | paid_net_salary |
|---|---|---|---|---|---|---|---|---|---|---|
| Engineering | 4 | 81 | 3 | 0 | 2 | 40 | 4 | 527687.6 | 44588.36 | 483099.24 |
| Finance | 2 | 39 | 2 | 1 | 1 | 21 | 2 | 208051.26 | 15589.5 | 190279.94 |
| Human Resources | 2 | 38 | 3 | 0 | 1 | 0 | 2 | 219704.55 | 16868.18 | 202836.37 |
| Marketing | 1 | 19 | 2 | 0 | 1 | 0 | 1 | 80181.76 | 4268.18 | 75913.58 |
| Operations | 1 | 21 | 0 | 0 | 1 | 0 | 1 | 31500.02 | 325 | 31175.02 |
| Product | 1 | 21 | 0 | 0 | 2 | 0 | 1 | 111681.89 | 8002.28 | 103679.61 |
| Sales | 1 | 19 | 0 | 2 | 1 | 9 | 1 | 52238.65 | 1473.87 | 46946.6 |

**Organisation totals per month** (the `SUM` of the rollup rows — what `GET /reports/monthly` reports as its footer):

| month_key | staff | present | late | slips | gross | tax | net |
|---|---|---|---|---|---|---|---|
| 2026-08 | 12 | 236 | 7 | 12 | 1238352.56 | 91801.31 | 1143142.16 |
| 2026-09 | 12 | 248 | 11 | 12 | 1281290.07 | 97545.91 | 1175835.07 |
| 2026-10 | 12 | 238 | 9 | 12 | 1231045.73 | 91115.37 | 1133930.36 |

These totals were cross-checked independently against `SELECT SUM(...) FROM Payroll` (`RPT-061` and the capture script), so the rollup is not merely self-consistent.

---

## 3. The report queries

`database/reports.sql` defines the views; the API issues the statements below (Section 5). They are reproduced here with the reasoning behind each join and aggregation.

### Q1 — Monthly attendance summary

```sql
SELECT *
  FROM vw_rpt_monthly_attendance_summary
 WHERE month_key = ?
 ORDER BY department, employee_name;
```

Inside the view:

```sql
WITH per_day AS (
    SELECT a.attendance_id, a.employee_id,
           substr(a.attendance_date, 1, 7) AS month_key,
           a.status, a.overtime_hours, a.is_late,
           CASE WHEN a.status = 'ON_LEAVE' AND EXISTS (
                    SELECT 1 FROM Leave l
                     WHERE l.employee_id = a.employee_id
                       AND l.status = 'APPROVED'
                       AND l.leave_type = 'UNPAID'
                       AND a.attendance_date >= l.start_date
                       AND a.attendance_date <= l.end_date) THEN 1 ELSE 0
           END AS is_unpaid_leave
      FROM Attendance a
),
monthly AS (
    SELECT employee_id, month_key,
           COUNT(*) AS logged_days,
           SUM(status = 'PRESENT')  AS present_days,
           SUM(status = 'HALF_DAY') AS half_days,
           SUM(status = 'ON_LEAVE' AND is_unpaid_leave = 0) AS leave_days,
           SUM(status = 'ABSENT' OR is_unpaid_leave = 1)    AS absent_days,
           SUM(status = 'HOLIDAY')  AS holiday_days,
           ROUND(COALESCE(SUM(overtime_hours), 0.0), 2) AS overtime_hours,
           SUM(is_late) AS late_marks
      FROM per_day
     GROUP BY employee_id, month_key
)
SELECT m.month_key, ...
  FROM monthly m
  JOIN Employee e ON e.employee_id = m.employee_id;
```

- **`EXISTS` against `Leave`** classifies an `ON_LEAVE` day as paid or unpaid. `Leave` is the only place that knows the leave *type*; `Attendance` only records that someone was on leave. The correlation `(employee_id, date within [start_date, end_date])` is served by the Phase 1 index `idx_leave_emp_dates_status (employee_id, start_date, end_date, status)`.
- **Partition, not double counting.** `leave_days + absent_days` always equals the number of `ON_LEAVE` + `ABSENT` rows (`RPT-021` asserts this for all 36 employee-months). The `CASE` is evaluated once per row into `is_unpaid_leave` so the two aggregates cannot drift apart.
- **`SUM(boolean)`** is used instead of `SUM(CASE … THEN 1 ELSE 0 END)`: in SQLite a comparison yields `0`/`1`, so the two are identical and the shorter form is less error-prone.
- **`JOIN Employee`** (not `LEFT JOIN`) is safe because `Attendance.employee_id` is a NOT NULL FK with `ON DELETE CASCADE`.

### Q2 — Late marks

```sql
SELECT *
  FROM vw_rpt_late_marks
 WHERE month_key = ?
 ORDER BY attendance_date, employee_name;
```

```sql
SELECT a.attendance_id, substr(a.attendance_date, 1, 7) AS month_key,
       a.attendance_date, strftime('%w', a.attendance_date) AS day_of_week,
       ... CASE day-of-week ... END AS day_of_week_name,
       e.employee_id, e.first_name || ' ' || e.last_name AS employee_name,
       e.department, a.check_in_time, a.late_minutes
  FROM Attendance a
  JOIN Employee e ON e.employee_id = a.employee_id
 WHERE a.is_late = 1;
```

- Filtering on `is_late = 1` rather than on `check_in_time > '09:30:00'` is the key decision: **one owner for the business rule.** The trigger that auto-marks lateness also resets it when a correction brings the punch in before the cut-off (`trg_reset_late_mark_update`). Re-deriving lateness in the report would disagree with a corrected record.
- `strftime('%w', …)` returns Sunday = `'0'`. The view exposes both the ISO number (`day_of_week_num`) and a name so the UI does not have to own a lookup table.

### Q3 — Department rollup

```sql
SELECT * FROM vw_rpt_department_rollup WHERE month_key = ? ORDER BY department;
```

```sql
WITH att AS (
    SELECT e.department, s.month_key, COUNT(*) AS employees_logged,
           SUM(s.present_days) ..., ROUND(AVG(s.attendance_percentage), 2) ...
      FROM vw_rpt_monthly_attendance_summary s
      JOIN Employee e ON e.employee_id = s.employee_id
     GROUP BY e.department, s.month_key
),
pay AS (
    SELECT sl.department, sl.month_key, COUNT(*) AS payroll_slips,
           SUM(status = 'PAID') AS paid_slips,
           ROUND(SUM(CASE WHEN status = 'PAID' THEN sl.net_salary ELSE 0 END), 2) AS paid_net_salary,
           ROUND(SUM(CASE WHEN status = 'APPROVED' THEN sl.net_salary ELSE 0 END), 2) AS approved_net_salary
      FROM vw_rpt_salary_slip sl
     GROUP BY sl.department, sl.month_key
)
SELECT ...
  FROM att
  FULL OUTER JOIN pay ON pay.department = att.department AND pay.month_key = att.month_key;
```

- **Two independent aggregates, joined on (department, month).** Pre-aggregating each side first avoids the classic fan-out where joining `Attendance` to `Payroll` multiplies rows.
- **`FULL OUTER JOIN`** so a department with payroll but no attendance rows (or the reverse — e.g. a brand-new joiner salary generated before their first clock-in) still appears, with `COALESCE(..., 0)` on the empty side. A plain `INNER JOIN` would silently drop such a department from a financial report.
- **`AVG(attendance_percentage)`** ignores `NULL`s (an empty month), which is the intended unweighted average across staff.
- **PAID vs APPROVED.** Payroll moves `DRAFT → APPROVED → PAID`. Counting only `PAID` net in the headline figure and exposing `APPROVED` separately means a half-processed month shows up as `paid_slips < payroll_slips`, not as a wrong total (`RPT-063` flips one slip to `APPROVED` and checks it moves columns).

### Q4 / Q5 — Payslip

```sql
SELECT * FROM vw_rpt_salary_slip            WHERE payroll_id = ?;
SELECT * FROM vw_rpt_salary_slip_line_items WHERE payroll_id = ? ORDER BY sort_order;
```

`payroll_id` is the `Payroll` primary key, so both are O(log n) lookups. The salary join is `Payroll.salary_id → Salary.salary_id` (the FK), which is what makes the slip a point-in-time snapshot even after a salary revision.

### Q6 — Month window

```sql
SELECT * FROM vw_rpt_attendance_month_scan;   -- month from current_month()
```

This exists purely so the month filter is **indexable** — see Section 4.

---

## 4. Index strategy (measured)

### 4.1 What was measured, and how

The comparison in this section was produced by `node tests/run_reports.js`. The suite builds **two** fresh databases in `os.tmpdir()` from the same SQL files:

- **WITH** — `schema` → `procedures` → `triggers` → `seed` → `reports` (report indexes present).
- **WITHOUT** — the same files, with the two `CREATE INDEX` statements in `reports.sql` stripped before execution. Every Phase 1 index remains, so the comparison is "report indexes vs no report indexes", not "indexed vs no indexes at all".

Both plans are then captured with `EXPLAIN QUERY PLAN`, and the test asserts the plan changed **and** that the result set is identical on both databases (only the access path may change).

### 4.2 Month window — `idx_attendance_month_late`

Report query (`vw_rpt_attendance_month_scan`, month = 2026-10):

```sql
SELECT * FROM vw_rpt_attendance_month_scan;
```

**BEFORE** — without the report indexes:

```
SEARCH a USING INDEX idx_attendance_date_late (attendance_date>? AND attendance_date<?)
```

**AFTER** — with `idx_attendance_month_late`:

```
SEARCH a USING INDEX idx_attendance_month_late (attendance_date>? AND attendance_date<?)
```

**Honest reading:** this is *not* a `SCAN → SEARCH` change. The Phase 1 index `idx_attendance_date_late (attendance_date, is_late)` already turns the month range into a range search. What the report index changes is *which* index is used: `idx_attendance_month_late (attendance_date, is_late, employee_id)` carries `employee_id`, the grouping key the summary feed needs, so the per-employee pass can come from the index. The larger point this section makes is the **shape of the predicate**: the month has to be expressed as a range on `attendance_date`, not as an equality on a derived key.

That distinction is what makes the next block a real measured before/after. The "obvious" month filter is a function on the indexed column:

```sql
SELECT * FROM Attendance WHERE substr(attendance_date, 1, 7) = ?;
```

With report indexes present:

```
SCAN Attendance
```

Without them:

```
SCAN Attendance
```

A function on the column defeats the index regardless of what is indexed. That is why `vw_rpt_attendance_month_scan` expresses the month as `attendance_date >= month || '-01' AND attendance_date < next month`, which the index can range-search.

### 4.3 Period lookups — `idx_payroll_period_status`

This is the clean before/after. Feature: "list the payroll for period 2026-10, then narrow by status" — used by the payroll list and by `POST /payroll/generate`'s period check.

Baseline — period filter only, no report indexes:

```sql
SELECT * FROM Payroll WHERE pay_period_year = ? AND pay_period_month = ?;   -- 2026, 10
```

```
SCAN Payroll
```

With `idx_payroll_period_status`, and the status filter folded into the same statement:

```sql
SELECT * FROM Payroll
 WHERE pay_period_year = ? AND pay_period_month = ? AND status = ?;          -- 2026, 10, 'PAID'
```

```
SEARCH Payroll USING INDEX idx_payroll_period_status (pay_period_year=? AND pay_period_month=? AND status=?)
```

`SCAN Payroll` → `SEARCH … USING INDEX idx_payroll_period_status (pay_period_year=? AND pay_period_month=? AND status=?)`.

This is exactly the transition the brief asked for. The Phase 1 index `idx_payroll_status (status)` can only answer "all PAID slips"; it cannot answer "this period's slips" without visiting every slip of that status. With 36 slips the planner picks `idx_payroll_status` for a status-filtered query on the un-indexed database (so the before-plan above is the *period-only* query, where there is no useful index to pick); with the period index it can seek the period directly — and the same plan is chosen when the status filter is added, because the status is the third key column.

### 4.4 Measured limits (stated, not hidden)

- **`is_late = 1` alone stays a scan.** `SELECT * FROM Attendance WHERE is_late = 1` reports `SCAN Attendance` on **both** databases. 27 matching rows out of 1,104 is too unselective for the planner to prefer an index, and no attendance index leads with `is_late`. The late-marks report is therefore always month-bounded (it reads the month window), never a bare `is_late` sweep.
- **The month-scan view needs a connection function.** SQLite forbids bound parameters inside a view, so `vw_rpt_attendance_month_scan` calls `current_month()`, which the server registers with `deterministic: true` before loading any SQL. A connection that does not register it gets `no such function: current_month` when that view is queried — never another month's data.
- **The summary view reads the whole attendance table.** `SELECT * FROM vw_rpt_monthly_attendance_summary WHERE month_key = ?` plans as (captured, identical with and without the report indexes):

  ```
  CO-ROUTINE monthly
  SCAN a USING INDEX idx_attendance_emp_date
  USE TEMP B-TREE FOR GROUP BY
  ...
  ```

  The filter on `month_key` (a derived column) is applied after the aggregate, so the month-scoped work is the scan; the index read is still an index scan, and at this data size (1,104 rows) it is the right plan. The indexable month window exists for queries over `Attendance` that do **not** need to aggregate every month (the late-marks report and the payroll generation read), and that is what `idx_attendance_month_late` serves.

- **Scaling statement.** The benchmark data set is 1,104 attendance rows and 36 payroll rows. At this size SQLite's planner legitimately prefers scans in several places, and the plans above say so. The index designs are justified by their key order for the queries the API will issue against a multi-year table; no timing numbers are claimed because none were measured. Documenting a plan is not the same as documenting a speed-up, and only the former was done here.

---

## 5. How these views are exposed by the API

The Phase 5 server implements the contract in `docs/build-conventions.md`. Each endpoint runs exactly one report statement; the response wrapper is `{ "data": … }` (errors: `{ "error": { "code", "message" } }`). All four endpoints below are **staff** (`ADMIN`/`HR`) except the payslip, which is staff **or** the slip's owner — an `EMPLOYEE` asking for another employee's payslip gets `403 FORBIDDEN`.

### `GET /api/attendance/summary?month=YYYY-MM`

- SQL: `SELECT * FROM vw_rpt_monthly_attendance_summary WHERE month_key = ? ORDER BY department, employee_name`.
- `data`: array of summary rows; each row is the view row. `attendance_percentage` may be `null` for a month with no working days.
- `422 VALIDATION_ERROR` for a malformed month (must match `^\d{4}-(0[1-9]|1[0-2])$`); an unknown but well-formed month returns `data: []`.

### `GET /api/attendance/late?month=YYYY-MM`

- SQL: `SELECT * FROM vw_rpt_late_marks WHERE month_key = ? ORDER BY attendance_date, employee_name`.
- `data`: array of late-punch rows with `attendance_date`, `day_of_week_name`, `employee_name`, `department`, `check_in_time`, `late_minutes`.

### `GET /api/reports/monthly?month=YYYY-MM`

- SQL: `SELECT * FROM vw_rpt_department_rollup WHERE month_key = ? ORDER BY department`.
- `data`: `{ month, departments: [rollup rows], totals: { employees_logged, present_days, late_marks, payroll_slips, paid_slips, paid_gross_salary, paid_tax_deduction, paid_net_salary, approved_net_salary } }`, where `totals` is the SUM of the returned rollup rows (the October footer in Section 2.4).
- `totals.paid_slips < totals.payroll_slips` is the signal that the month is only partly processed.

### `GET /api/payroll/:id/payslip`

- SQL: `SELECT * FROM vw_rpt_salary_slip WHERE payroll_id = ?` then `SELECT * FROM vw_rpt_salary_slip_line_items WHERE payroll_id = ? ORDER BY sort_order`.
- `403 FORBIDDEN` (same status whether or not the row exists) when the caller is an `EMPLOYEE` and `payroll.employee_id ≠ auth.employee_id`.
- `404 NOT_FOUND` for an unknown `payroll_id` (staff or owner).
- `data`: `{ payslip: <vw_rpt_salary_slip row>, lineItems: [6 line-item rows], net: payslip.net_salary }`.

The four statements above are the "Q1…Q5" block at the bottom of `database/reports.sql`; keeping them in one place means the doc, the suite and the API all point at the same SQL.

---

## 6. Verification

`node tests/run_reports.js` — **46 / 46 passing**. How the expected values were established:

- **No expected value was copied from the object under test.** Every figure was read off the seed `INSERT` rows first (e.g. "Amit Verma, September: 20 PRESENT, 2 ON_LEAVE inside an APPROVED UNPAID leave, 8 HOLIDAY, 7.5 OT, 2 late") and written into the test; the view then had to produce it.
- **Cross checks, not just self-checks.** `RPT-021` recomputes day counts with a direct `COUNT(*) … GROUP BY status` on `Attendance` for every employee-month; `RPT-029` requires agreement with the Phase 2 summary view; `RPT-043` requires the late-marks view and the summary view to agree per employee-month; `RPT-054` requires the line items to sum back to gross and net for every slip; `RPT-061` requires the rollup totals to equal the raw sums for all three months.
- **The payslip arithmetic is recomputed in the test from the seeded salary and attendance**, not taken from the `Payroll` row.
- **EXPLAIN comparison** — Section 4, both plans printed by the runner, result sets asserted identical with and without the indexes.
- **Behavioural edges** — a newer salary package does not change a historical slip (`RPT-053`); an `APPROVED` slip moves out of the paid columns (`RPT-063`); an unknown month returns zero rows rather than an error (`RPT-091`); a connection with `current_month()` returning `NULL` yields no rows (`RPT-076`); `reports.sql` re-applies cleanly (`RPT-007`).

**What is *not* verified here:**

- No wall-clock timing was measured, so no speed-up is claimed (Section 4.4).
- The API section is the contract Phase 5 must implement; this suite checks the view column names and shapes (`RPT-090`), not the HTTP layer itself.
- The 1,104-row data set cannot demonstrate how the planner behaves on a multi-year table; the index key orders are argued from the queries, not from plans on large data.

### Reproducing

```powershell
node tests/run_reports.js
node tests/run_reports.js --verbose
node tests/run_e2e.js
```
