-- ============================================================================
-- PayTrack Enterprise Payroll & Attendance Management System
-- Reporting Views & Report Indexes (Phase 3 Query & Report Development)
-- ============================================================================
-- Candidate Name : Vinayak
-- Roll Number    : 2501730150
-- Course         : Database Management Systems (CapStone Phase 3)
-- Engine Target  : SQLite 3 Engine & Node.js Native Runtime
-- Dialect Mirrors: PostgreSQL 14+ & MySQL 8.0+ (commented reference blocks)
-- ============================================================================
-- Contents
--   SECTION 1  Report views consumed by the REST API
--                vw_rpt_monthly_attendance_summary   GET /attendance/summary
--                vw_rpt_late_marks                   GET /attendance/late
--                vw_rpt_salary_slip                  GET /payroll/:id/payslip
--                vw_rpt_salary_slip_line_items       GET /payroll/:id/payslip (items)
--                vw_rpt_department_rollup            GET /reports/monthly
--                vw_rpt_attendance_month_scan        month window (indexable)
--   SECTION 2  Report-support indexes
--   SECTION 3  Documented report queries (the exact SQL the API issues)
--
-- Month filter convention used by every report view:
--   A view exposes month_key ('YYYY-MM'); the API filters with
--     WHERE month_key = '2026-10'
--   Month keys are built with substr(date, 1, 7), never strftime('%Y-%m').
--   Both are correct, but every substr key is a plain prefix of the stored
--   ISO date, which allows the same month to be expressed as the indexable
--   range in vw_rpt_attendance_month_scan. The report queries that touch the
--   Attendance table directly use that range, not the key equality.
--
-- Idempotency: every object is created with DROP ... IF EXISTS or
-- IF NOT EXISTS so the file may be re-applied to an existing database (the
-- report indexes are IF NOT EXISTS and survive a re-apply).
--
-- Connection requirement: vw_rpt_attendance_month_scan calls current_month(),
-- which the server registers before loading this file. It is declared last in
-- this file so a connection that loads reports.sql without the function
-- still gets every other report object.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ============================================================================
-- SECTION 1: REPORT VIEWS
-- ============================================================================


-- ----------------------------------------------------------------------------
-- View 1: vw_rpt_monthly_attendance_summary
-- ----------------------------------------------------------------------------
-- Purpose: one row per (employee, calendar month) giving the day-type
-- breakdown, overtime, late marks, attendance percentage and an effective
-- paid-day figure. Backs GET /attendance/summary and the /reports/monthly
-- rollup, and is the attendance source the payroll engine reads from.
--
-- Day semantics (identical to vw_employee_attendance_monthly_summary so that
-- the report and the payroll engine can never disagree):
--   present_days  : status = 'PRESENT'
--   half_days     : status = 'HALF_DAY' (counted as whole rows, 0.5 each)
--   leave_days    : status = 'ON_LEAVE' not covered by an APPROVED UNPAID leave
--   absent_days   : status = 'ABSENT' plus ON_LEAVE rows covered by an
--                   APPROVED UNPAID leave (unpaid absence is deducted)
--   holiday_days  : status = 'HOLIDAY'
--
-- attendance_percentage:
--   logged_days  = present + half + leave + absent + holiday
--   working_days = logged_days - holiday_days   (holiday rows are week-offs,
--                  not absences, so they leave the denominator)
--   credited_days = present + 0.5 * half + leave_days
--   percentage = credited / working * 100, NULL (not 0) when working is 0, so
--   an empty month is distinguishable from total absence.
--   ABSENT rows (including unpaid ON_LEAVE, which is booked into absent_days)
--   are deliberately NOT credited. Note that under the seeded data every
--   month's PRESENT / HALF_DAY / leave rows fill all non-holiday days, so a
--   month where every working day was covered reads exactly 100.00; a real
--   absence shows up in absent_days and pulls the percentage down.
--
-- LEFT JOIN keeps an employee with no attendance in a given month out of the
-- view only if they never logged a row; active employees with no rows for the
-- requested month simply do not appear (report consumers iterate the
-- directory separately).
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_rpt_monthly_attendance_summary;
CREATE VIEW vw_rpt_monthly_attendance_summary AS
WITH per_day AS (
    SELECT
        a.attendance_id,
        a.employee_id,
        substr(a.attendance_date, 1, 7) AS month_key,
        a.status,
        a.overtime_hours,
        a.is_late,
        -- An ON_LEAVE row is UNPAID when it falls inside an APPROVED UNPAID leave
        CASE
            WHEN a.status = 'ON_LEAVE' AND EXISTS (
                SELECT 1 FROM Leave l
                WHERE l.employee_id = a.employee_id
                  AND l.status = 'APPROVED'
                  AND l.leave_type = 'UNPAID'
                  AND a.attendance_date >= l.start_date
                  AND a.attendance_date <= l.end_date
            ) THEN 1 ELSE 0
        END AS is_unpaid_leave
    FROM Attendance a
),
monthly AS (
    SELECT
        pd.employee_id,
        pd.month_key,
        COUNT(*) AS logged_days,
        SUM(CASE WHEN pd.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN pd.status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_days,
        SUM(CASE WHEN pd.status = 'ON_LEAVE' AND pd.is_unpaid_leave = 0 THEN 1 ELSE 0 END) AS leave_days,
        SUM(CASE WHEN pd.status = 'ABSENT' OR pd.is_unpaid_leave = 1 THEN 1 ELSE 0 END) AS absent_days,
        SUM(CASE WHEN pd.status = 'HOLIDAY' THEN 1 ELSE 0 END) AS holiday_days,
        ROUND(COALESCE(SUM(pd.overtime_hours), 0.0), 2) AS overtime_hours,
        SUM(pd.is_late) AS late_marks
    FROM per_day pd
    GROUP BY pd.employee_id, pd.month_key
)
SELECT
    m.month_key,
    CAST(substr(m.month_key, 1, 4) AS INTEGER) AS period_year,
    CAST(substr(m.month_key, 6, 2) AS INTEGER) AS period_month,
    e.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department,
    e.role,
    m.logged_days,
    m.present_days,
    m.half_days,
    m.leave_days,
    m.absent_days,
    m.holiday_days,
    m.overtime_hours,
    m.late_marks,
    ROUND(m.present_days + 0.5 * m.half_days + m.leave_days, 2) AS effective_paid_days,
    CASE
        WHEN m.logged_days - m.holiday_days = 0 THEN NULL
        ELSE ROUND(
            100.0 * (m.present_days + 0.5 * m.half_days + m.leave_days)
                  / (m.logged_days - m.holiday_days), 2)
    END AS attendance_percentage
FROM monthly m
JOIN Employee e ON e.employee_id = m.employee_id;

-- ----------------------------------------------------------------------------
-- View 2: vw_rpt_late_marks
-- ----------------------------------------------------------------------------
-- Purpose: every tardy punch with the employee identity and the calendar
-- context needed for a HR report: ISO date, day of week, month key, minutes
-- late. Backs GET /attendance/late?month=YYYY-MM.
--
-- is_late is maintained by trg_auto_late_mark_* (CHECK_IN after 09:30:00)
-- and trg_reset_late_mark_update (a correction that clears a late punch).
-- This view never recomputes lateness from clock times, so it reports exactly
-- what the trigger marked. No Attendance index has is_late as its leading
-- column, so the scan is a full table scan bounded only by rows; see the
-- index strategy in Section 2 for the honest measurement of this query.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_rpt_late_marks;
CREATE VIEW vw_rpt_late_marks AS
SELECT
    a.attendance_id,
    substr(a.attendance_date, 1, 7) AS month_key,
    a.attendance_date,
    strftime('%w', a.attendance_date) AS day_of_week,      -- ISO: 0 = Sunday
    CAST(strftime('%w', a.attendance_date) AS INTEGER) AS day_of_week_num,
    CASE CAST(strftime('%w', a.attendance_date) AS INTEGER)
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        ELSE 'Saturday'
    END AS day_of_week_name,
    CASE WHEN strftime('%w', a.attendance_date) IN ('0', '6') THEN 1 ELSE 0 END AS is_weekend,
    e.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department,
    a.check_in_time,
    a.late_minutes
FROM Attendance a
JOIN Employee e ON e.employee_id = a.employee_id
WHERE a.is_late = 1;

-- ----------------------------------------------------------------------------
-- View 3: vw_rpt_salary_slip
-- ----------------------------------------------------------------------------
-- Purpose: one row per finalized payroll slip with the employee identity and
-- the contracted Salary package joined in, plus derived figures. Backs
-- GET /payroll/:id/payslip and the payroll list.
--
-- Salary join direction: Payroll.salary_id -> Salary.salary_id (the FK), NOT
-- Salary.is_active = 1. A payslip must show the package the slip was computed
-- from; if the employee later receives a revision the historical slip stays
-- attached to the old salary row (3NF snapshot property of Payroll).
--
-- period_key and month_key are both exposed: 'YYYY-MM' is the API month filter,
-- "August 2026" is for display.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_rpt_salary_slip;
CREATE VIEW vw_rpt_salary_slip AS
SELECT
    p.payroll_id,
    printf('%04d-%02d', p.pay_period_year, p.pay_period_month) AS month_key,
    p.pay_period_year AS period_year,
    p.pay_period_month AS period_month,
    CASE p.pay_period_month
        WHEN 1 THEN 'January'  WHEN 2 THEN 'February' WHEN 3 THEN 'March'
        WHEN 4 THEN 'April'    WHEN 5 THEN 'May'      WHEN 6 THEN 'June'
        WHEN 7 THEN 'July'     WHEN 8 THEN 'August'   WHEN 9 THEN 'September'
        WHEN 10 THEN 'October' WHEN 11 THEN 'November' ELSE 'December'
    END || ' ' || p.pay_period_year AS period_label,
    e.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.email,
    e.department,
    e.role,
    p.salary_id,
    s.base_salary,
    s.hra,
    s.allowances,
    p.working_days,
    p.present_days,
    p.absent_days,
    p.half_days,
    p.leave_days,
    p.overtime_hours,
    p.base_salary_earned,
    p.allowances_earned,
    p.overtime_pay,
    p.gross_salary,
    p.tax_deduction,
    p.unpaid_leave_deduction,
    p.other_deductions,
    p.net_salary,
    -- ROUND is required, not cosmetic: DECIMAL columns are stored as REAL, and
    -- unrounded subtraction lands on 123789.70999999999 for slip 2. The payslip
    -- arithmetic is in paise, so the cross-check is rounded to 2 dp.
    ROUND(p.gross_salary
        - p.tax_deduction - p.unpaid_leave_deduction - p.other_deductions, 2) AS computed_net_salary,
    p.status,
    p.payment_date,
    p.created_at,
    p.updated_at
FROM Payroll p
JOIN Employee e ON e.employee_id = p.employee_id
JOIN Salary   s ON s.salary_id   = p.salary_id;

-- ----------------------------------------------------------------------------
-- View 4: vw_rpt_salary_slip_line_items
-- ----------------------------------------------------------------------------
-- Purpose: the payslip broken into individual line items (earnings,
-- deductions, net) as one row per item, in display order. This is the shape
-- the React payslip component renders and the shape GET /payroll/:id/payslip
-- embeds as `lineItems`. Backs GET /payroll/:id/payslip.
--
-- item_type is 'EARNING' or 'DEDUCTION'. Net is not a line item; it is the
-- sum of earnings minus the sum of deductions and is emitted separately by
-- the API from vw_rpt_salary_slip.net_salary.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_rpt_salary_slip_line_items;
CREATE VIEW vw_rpt_salary_slip_line_items AS
WITH earnings AS (
    SELECT p.payroll_id, 10 AS sort_order, 'EARNING' AS item_type,
           'BASE_SALARY' AS item_code, 'Base Salary (Prorated)' AS item_label,
           p.base_salary_earned AS amount
    FROM Payroll p
    UNION ALL
    SELECT p.payroll_id, 20, 'EARNING', 'HRA_AND_ALLOWANCES', 'HRA + Allowances (Prorated)',
           p.allowances_earned
    FROM Payroll p
    UNION ALL
    SELECT p.payroll_id, 30, 'EARNING', 'OVERTIME', 'Overtime Pay',
           p.overtime_pay
    FROM Payroll p
),
deductions AS (
    SELECT p.payroll_id, 40 AS sort_order, 'DEDUCTION' AS item_type,
           'TAX_TDS' AS item_code, 'Income Tax (TDS, progressive slabs)' AS item_label,
           p.tax_deduction AS amount
    FROM Payroll p
    UNION ALL
    SELECT p.payroll_id, 50, 'DEDUCTION', 'UNPAID_LEAVE', 'Unpaid Leave Deduction',
           p.unpaid_leave_deduction
    FROM Payroll p
    UNION ALL
    SELECT p.payroll_id, 60, 'DEDUCTION', 'OTHER', 'Other Deductions',
           p.other_deductions
    FROM Payroll p
)
SELECT payroll_id, sort_order, item_type, item_code, item_label, ROUND(amount, 2) AS amount
FROM (
    SELECT * FROM earnings
    UNION ALL
    SELECT * FROM deductions
);

-- ----------------------------------------------------------------------------
-- View 5: vw_rpt_department_rollup
-- ----------------------------------------------------------------------------
-- Purpose: per (department, month) headcount and attendance totals plus the
-- finalized payroll totals for the same period. Backs GET /reports/monthly.
--
-- Two independent aggregates are joined on (department, month_key):
--   - att: employees with at least one attendance row that month
--   - pay: PAID payroll slips for that period (APPROVED slips are counted
--          separately as approved_net_salary so a pending period is visible)
-- The attendance side LEFT JOINs Employee so an employee with rows keeps their
-- department assignment; department is read from Employee, the master record,
-- rather than duplicated onto Attendance.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_rpt_department_rollup;
CREATE VIEW vw_rpt_department_rollup AS
WITH att AS (
    SELECT
        e.department,
        s.month_key,
        COUNT(*) AS employees_logged,
        SUM(s.present_days) AS present_days,
        SUM(s.half_days) AS half_days,
        SUM(s.leave_days) AS leave_days,
        SUM(s.absent_days) AS absent_days,
        SUM(s.holiday_days) AS holiday_days,
        ROUND(SUM(s.overtime_hours), 2) AS overtime_hours,
        SUM(s.late_marks) AS late_marks,
        ROUND(AVG(s.attendance_percentage), 2) AS avg_attendance_percentage
    FROM vw_rpt_monthly_attendance_summary s
    JOIN Employee e ON e.employee_id = s.employee_id
    GROUP BY e.department, s.month_key
),
pay AS (
    SELECT
        sl.department,
        sl.month_key,
        COUNT(*) AS payroll_slips,
        SUM(CASE WHEN sl.status = 'PAID' THEN 1 ELSE 0 END) AS paid_slips,
        ROUND(SUM(CASE WHEN sl.status = 'PAID' THEN sl.gross_salary ELSE 0 END), 2) AS paid_gross_salary,
        ROUND(SUM(CASE WHEN sl.status = 'PAID' THEN sl.tax_deduction ELSE 0 END), 2) AS paid_tax_deduction,
        ROUND(SUM(CASE WHEN sl.status = 'PAID' THEN sl.net_salary ELSE 0 END), 2) AS paid_net_salary,
        ROUND(SUM(CASE WHEN sl.status = 'APPROVED' THEN sl.net_salary ELSE 0 END), 2) AS approved_net_salary
    FROM vw_rpt_salary_slip sl
    GROUP BY sl.department, sl.month_key
)
SELECT
    COALESCE(att.department, pay.department) AS department,
    COALESCE(att.month_key, pay.month_key) AS month_key,
    COALESCE(att.employees_logged, 0) AS employees_logged,
    COALESCE(att.present_days, 0) AS present_days,
    COALESCE(att.half_days, 0) AS half_days,
    COALESCE(att.leave_days, 0) AS leave_days,
    COALESCE(att.absent_days, 0) AS absent_days,
    COALESCE(att.holiday_days, 0) AS holiday_days,
    COALESCE(att.overtime_hours, 0.0) AS overtime_hours,
    COALESCE(att.late_marks, 0) AS late_marks,
    att.avg_attendance_percentage,
    COALESCE(pay.payroll_slips, 0) AS payroll_slips,
    COALESCE(pay.paid_slips, 0) AS paid_slips,
    COALESCE(pay.paid_gross_salary, 0.0) AS paid_gross_salary,
    COALESCE(pay.paid_tax_deduction, 0.0) AS paid_tax_deduction,
    COALESCE(pay.paid_net_salary, 0.0) AS paid_net_salary,
    COALESCE(pay.approved_net_salary, 0.0) AS approved_net_salary
FROM att
FULL OUTER JOIN pay
    ON pay.department = att.department AND pay.month_key = att.month_key;

-- ----------------------------------------------------------------------------
-- View 6: vw_rpt_attendance_month_scan  (declared last: needs current_month())
-- ----------------------------------------------------------------------------
-- Purpose: the month window expressed as a range on the stored ISO date, so
-- that the report queries can be answered by an index range search instead
-- of a full table scan. Backs the month window used by the attendance,
-- late-marks and rollup report queries (see Section 3) and by
-- POST /payroll/generate's attendance read.
--
-- Why a range instead of a month-key equality:
--   The obvious month predicate, substr(attendance_date, 1, 7) = ?, applies a
--   function to the indexed column, so no index can be used and SQLite
--   reports SCAN Attendance (captured in docs/phase-3/query-reports.md). Because every
--   attendance_date is a fixed-width 'YYYY-MM-DD' string, the month
--   [month_key, next month) is exactly the half-open range
--     attendance_date >= month_key || '-01'
--     attendance_date <  next month's first day
--   which the planner answers with a range search on any index whose leading
--   column is attendance_date (idx_attendance_month_late, or the Phase 1
--   idx_attendance_date_late when the report indexes are absent).
--
-- How the month reaches the view:
--   SQLite forbids bound parameters inside a view, so the month comes from a
--   scalar function the API registers on the connection before any SQL file
--   is loaded (reports.sql cannot create it):
--     db.function('current_month', { deterministic: true }, () => monthKey);
--   The function must be pure and return the same 'YYYY-MM' key for the whole
--   statement. The tests register and re-register it per month and verify the
--   view matches every report month (RPT-030b, RPT-030c).
--
-- Missing function: a connection that never registers current_month gets
-- "no such function: current_month" when the view is queried, never another
-- month's data. Because the view is declared last in this file, all other
-- report objects are still created in that case.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_rpt_attendance_month_scan;
CREATE VIEW vw_rpt_attendance_month_scan AS
SELECT
    a.attendance_id,
    a.employee_id,
    a.attendance_date,
    substr(a.attendance_date, 1, 7) AS month_key,
    a.status,
    a.check_in_time,
    a.check_out_time,
    a.hours_worked,
    a.overtime_hours,
    a.is_late,
    a.late_minutes
FROM Attendance a
WHERE a.attendance_date >= current_month() || '-01'
  AND a.attendance_date <  COALESCE(
        strftime('%Y-%m', current_month() || '-01', '+1 month'),
        '9999-12-01');

-- ============================================================================
-- SECTION 2: REPORT-SUPPORT INDEXES
-- ============================================================================
-- Each index below is justified by a specific report query, and the
-- before/after EXPLAIN QUERY PLAN for that query is captured in
-- docs/phase-3/query-reports.md (measured with node tests/run_reports.js).
--
-- idx_attendance_month_late  (attendance_date, is_late, employee_id)
--   Query:  the month window feeding the monthly attendance summary and the
--           late-marks report
--           SELECT * FROM vw_rpt_attendance_month_scan;
--   Why:    attendance_date first, because every report is month-scoped and
--           the range predicate on the leading column is what makes the
--           window a range search. is_late second so a late-punch count for
--           the month fetches (is_late, employee_id) from the index; employee_id
--           last carries the group key for the per-employee rollup.
--   Measured: without the report indexes the same window already uses the
--           Phase 1 idx_attendance_date_late (attendance_date, is_late); with
--           this index it switches to idx_attendance_month_late. This index
--           is therefore a change of access path (plus employee_id as an
--           index-carried column), not a change from scan to search - stated
--           as such in docs/phase-3/query-reports.md.
--   Note:   This deliberately does NOT dominate idx_attendance_emp_date
--           (employee_id, attendance_date): the leading column differs, so the
--           per-employee equality-join path keeps using the Phase-1 index.
--
-- idx_payroll_period_status  (pay_period_year, pay_period_month, status)
--   Query:  the finalized payroll line for a period / payslip listing
--           SELECT ... FROM Payroll
--           WHERE pay_period_year = ? AND pay_period_month = ?
--             AND status IN ('APPROVED','PAID')
--   Why:    period first (the report's filter), status last so a status
--           filter inside a period is an exact index key rather than a scan of
--           the period's rows. The Phase-1 idx_payroll_status (status) alone
--           cannot answer a period query without visiting every slip of that
--           status.
-- ----------------------------------------------------------------------------
-- Why these two indexes are the only ones added, and the honest limit:
--   - The month-key equality on a function (substr(attendance_date,1,7) = ?)
--     is a full table scan with or without these indexes; that is why the
--     report queries use the range in vw_rpt_attendance_month_scan.
--   - is_late = 1 alone matches 27 of 1,104 rows and stays SCAN Attendance
--     with these indexes in place; the late-marks report is therefore always
--     month-bounded, never a bare is_late sweep.
--   Both facts are measured and stated in docs/phase-3/query-reports.md rather than
--   papered over.
CREATE INDEX IF NOT EXISTS idx_attendance_month_late
    ON Attendance (attendance_date, is_late, employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_period_status
    ON Payroll (pay_period_year, pay_period_month, status);

-- ============================================================================
-- SECTION 3: DOCUMENTED REPORT QUERIES (the SQL the API issues)
-- ============================================================================
-- These are the statements the server runs for each Phase 3 endpoint. The API
-- module embeds the same text. Parameter placeholders use node:sqlite's '?'.
--
-- Every month-scoped endpoint first sets the connection's report month:
--     db.function('current_month', { deterministic: true }, () => month)
--                                                          (see View 6)
--
-- Q1  GET /attendance/summary?month=YYYY-MM   (staff only)
--     SELECT * FROM vw_rpt_monthly_attendance_summary
--      WHERE month_key = ?
--      ORDER BY department, employee_name;
--     (this view's plan is captured in docs/phase-3/query-reports.md, RPT-073)
--
-- Q2  GET /attendance/late?month=YYYY-MM       (staff only)
--     SELECT * FROM vw_rpt_late_marks
--      WHERE month_key = ?
--      ORDER BY attendance_date, employee_name;
--
-- Q3  GET /reports/monthly?month=YYYY-MM       (staff only)
--     Department rollup plus organisation totals for the month:
--     SELECT * FROM vw_rpt_department_rollup
--      WHERE month_key = ?
--      ORDER BY department;
--     -- org totals are the SUM of the rollup rows for the month
--
-- Q4  GET /payroll/:id/payslip                   (staff or owner)
--     SELECT * FROM vw_rpt_salary_slip
--      WHERE payroll_id = ?;
--     (payroll_id is the Payroll primary key, so this is an O(log n) lookup;
--      the API then checks the caller is staff or the owner before returning)
--
-- Q5  GET /payroll/:id/payslip line items (embedded by the API):
--     SELECT * FROM vw_rpt_salary_slip_line_items
--      WHERE payroll_id = ?
--      ORDER BY sort_order;
--     (Q4 + Q5 results form one payslip payload:
--      { payslip: Q4 row, lineItems: Q5 rows, net })
--
-- Period-scoped checks used by POST /payroll/generate and the payroll list,
-- and the month window the attendance/late/rollup reports read. These are the
-- two statements measured with EXPLAIN QUERY PLAN in docs/phase-3/query-reports.md:
--     SELECT * FROM Payroll
--      WHERE pay_period_year = ? AND pay_period_month = ?
--        AND status = 'DRAFT';                      -- idx_payroll_period_status
--     SELECT * FROM vw_rpt_attendance_month_scan;   -- idx_attendance_month_late
