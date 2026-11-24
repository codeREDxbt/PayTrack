-- ============================================================================
-- PayTrack Enterprise Payroll & Attendance Management System
-- Stored Procedures & Functions (Phase 2 Procedural Implementation)
-- ============================================================================
-- Candidate Name : Vinayak
-- Roll Number    : 2501730150
-- Course         : Database Management Systems (CapStone Phase 2)
-- Engine Target  : SQLite 3 Engine & Node.js Native Runtime
-- Dialect Mirrors: PostgreSQL 14+ (PL/pgSQL) & MySQL 8.0+ (DELIMITER Procedures)
-- ============================================================================

-- ============================================================================
-- SECTION 1: SQLite Calculation Views & SQL Functions (Executable Engine)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View 1: vw_employee_attendance_monthly_summary
-- ----------------------------------------------------------------------------
-- Aggregates monthly raw attendance records per employee for payroll computation:
--   - present_days : Count of 'PRESENT' records
--   - half_days    : Count of 'HALF_DAY' records (0.5 day credit)
--   - leave_days   : Count of 'ON_LEAVE' records for approved paid leaves (Casual, Sick, Earned)
--   - absent_days  : Count of 'ABSENT' records plus 'ON_LEAVE' records matching approved 'UNPAID' leaves
--   - holiday_days : Count of 'HOLIDAY' records (weekends / national holidays)
--   - overtime_hrs : Sum of overtime hours
--   - late_marks   : Count of tardy check-ins
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_employee_attendance_monthly_summary;
CREATE VIEW vw_employee_attendance_monthly_summary AS
SELECT 
    e.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department,
    e.role,
    strftime('%Y', a.attendance_date) AS attendance_year,
    strftime('%m', a.attendance_date) AS attendance_month,
    COUNT(a.attendance_id) AS total_logged_days,
    SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
    SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_days,
    SUM(CASE 
        WHEN a.status = 'ON_LEAVE' AND NOT EXISTS (
            SELECT 1 FROM Leave l 
            WHERE l.employee_id = a.employee_id 
              AND l.status = 'APPROVED' 
              AND l.leave_type = 'UNPAID' 
              AND a.attendance_date >= l.start_date 
              AND a.attendance_date <= l.end_date
        ) THEN 1 ELSE 0 END) AS leave_days,
    SUM(CASE 
        WHEN a.status = 'ABSENT' OR (
            a.status = 'ON_LEAVE' AND EXISTS (
                SELECT 1 FROM Leave l 
                WHERE l.employee_id = a.employee_id 
                  AND l.status = 'APPROVED' 
                  AND l.leave_type = 'UNPAID' 
                  AND a.attendance_date >= l.start_date 
                  AND a.attendance_date <= l.end_date
            )
        ) THEN 1 ELSE 0 END) AS absent_days,
    SUM(CASE WHEN a.status = 'HOLIDAY' THEN 1 ELSE 0 END) AS holiday_days,
    COALESCE(SUM(a.overtime_hours), 0.0) AS total_overtime_hours,
    COALESCE(SUM(a.is_late), 0) AS total_late_marks
FROM Employee e
JOIN Attendance a ON e.employee_id = a.employee_id
GROUP BY 
    e.employee_id, 
    e.first_name, 
    e.last_name, 
    e.department, 
    e.role, 
    strftime('%Y', a.attendance_date), 
    strftime('%m', a.attendance_date);

-- ----------------------------------------------------------------------------
-- View 2: vw_payroll_procedural_computation
-- ----------------------------------------------------------------------------
-- Implements the exact procedural business logic for prorated compensation,
-- progressive tax deduction, and net earnings directly in declarative SQL.
--
-- Mathematical Model:
--   1. daily_rate = base_salary / working_days
--   2. hourly_rate = base_salary / (working_days * 8.0)
--   3. effective_work_days = present_days + (half_days * 0.5) + leave_days
--   4. base_salary_earned = effective_work_days * daily_rate
--   5. allowances_earned = (hra + allowances) * (effective_work_days / working_days)
--   6. overtime_pay = overtime_hours * hourly_rate * 1.0
--   7. gross_salary = base_salary_earned + allowances_earned + overtime_pay
--   8. Progressive Tax Deduction Slabs:
--      - 0% up to ₹25,000
--      - 5% on ₹25,000 - ₹50,000 (Max ₹1,250)
--      - 10% on ₹50,000 - ₹100,000 (Max ₹5,000)
--      - 15% above ₹100,000
--   9. unpaid_leave_deduction = absent_days * daily_rate
--  10. net_salary = gross_salary - tax_deduction - unpaid_leave_deduction - other_deductions
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_payroll_procedural_computation;
CREATE VIEW vw_payroll_procedural_computation AS
WITH BaseMetrics AS (
    SELECT 
        e.employee_id,
        s.salary_id,
        CAST(att.attendance_year AS INTEGER) AS pay_period_year,
        CAST(att.attendance_month AS INTEGER) AS pay_period_month,
        s.base_salary,
        s.hra,
        s.allowances,
        -- Standard 22 working days per business month
        22 AS working_days,
        att.present_days,
        att.half_days,
        att.leave_days,
        att.absent_days,
        att.total_overtime_hours,
        -- Effective working days: present + (half * 0.5) + approved paid leaves
        (att.present_days + (att.half_days * 0.5) + att.leave_days) AS effective_work_days,
        -- Daily rate
        ROUND(s.base_salary / 22.0, 2) AS daily_rate,
        -- Hourly rate (8 hours/day)
        ROUND(s.base_salary / (22.0 * 8.0), 2) AS hourly_rate
    FROM Employee e
    JOIN Salary s ON e.employee_id = s.employee_id AND s.is_active = 1
    JOIN vw_employee_attendance_monthly_summary att ON e.employee_id = att.employee_id
),
EarningsComputed AS (
    SELECT 
        bm.*,
        -- Base salary earned prorated
        ROUND(bm.effective_work_days * bm.daily_rate, 2) AS base_salary_earned,
        -- Allowances earned prorated
        ROUND((bm.hra + bm.allowances) * (bm.effective_work_days / bm.working_days), 2) AS allowances_earned,
        -- Overtime pay (1.0x hourly multiplier)
        ROUND(bm.total_overtime_hours * bm.hourly_rate * 1.0, 2) AS overtime_pay,
        -- Unpaid leave deduction (absent days * daily rate)
        ROUND(bm.absent_days * bm.daily_rate, 2) AS unpaid_leave_deduction,
        -- Gross salary = base earned + allowances earned + overtime pay
        ROUND(
            (bm.effective_work_days * bm.daily_rate) +
            ((bm.hra + bm.allowances) * (bm.effective_work_days / bm.working_days)) +
            (bm.total_overtime_hours * bm.hourly_rate * 1.0),
            2
        ) AS gross_salary
    FROM BaseMetrics bm
),
TaxAndNetComputed AS (
    SELECT 
        ec.*,
        -- Progressive Tax Deduction Computation
        CASE 
            WHEN ec.gross_salary <= 25000.00 THEN 0.00
            WHEN ec.gross_salary <= 50000.00 THEN 
                ROUND((ec.gross_salary - 25000.00) * 0.05, 2)
            WHEN ec.gross_salary <= 100000.00 THEN 
                ROUND(1250.00 + ((ec.gross_salary - 50000.00) * 0.10), 2)
            ELSE 
                ROUND(6250.00 + ((ec.gross_salary - 100000.00) * 0.15), 2)
        END AS tax_deduction,
        0.00 AS other_deductions
    FROM EarningsComputed ec
)
SELECT 
    tnc.employee_id,
    tnc.salary_id,
    tnc.pay_period_year,
    tnc.pay_period_month,
    tnc.working_days,
    tnc.present_days,
    tnc.absent_days,
    tnc.half_days,
    tnc.leave_days,
    tnc.total_overtime_hours AS overtime_hours,
    tnc.base_salary_earned,
    tnc.allowances_earned,
    tnc.overtime_pay,
    tnc.gross_salary,
    tnc.tax_deduction,
    tnc.unpaid_leave_deduction,
    tnc.other_deductions,
    -- Net salary = Gross - Tax - Unpaid Leave - Other Deductions
    ROUND(tnc.gross_salary - tnc.tax_deduction - tnc.unpaid_leave_deduction - tnc.other_deductions, 2) AS net_salary
FROM TaxAndNetComputed tnc;

-- ============================================================================
-- SECTION 2: PostgreSQL Stored Procedures & Functions (PL/pgSQL Dialect)
-- ============================================================================
-- Enterprise stored procedures for PostgreSQL deployment.
-- ============================================================================

/*
-- Function: Progressive Tax Slab Calculator
CREATE OR REPLACE FUNCTION fn_calculate_tax(p_gross NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    v_tax NUMERIC := 0.00;
BEGIN
    IF p_gross <= 25000.00 THEN
        v_tax := 0.00;
    ELSIF p_gross <= 50000.00 THEN
        v_tax := (p_gross - 25000.00) * 0.05;
    ELSIF p_gross <= 100000.00 THEN
        v_tax := 1250.00 + ((p_gross - 50000.00) * 0.10);
    ELSE
        v_tax := 6250.00 + ((p_gross - 100000.00) * 0.15);
    END IF;
    
    RETURN ROUND(v_tax, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Stored Procedure: Calculate and Insert Monthly Payroll Batch
CREATE OR REPLACE PROCEDURE sp_process_monthly_payroll(
    p_year INT,
    p_month INT,
    p_working_days INT DEFAULT 22
)
AS $$
DECLARE
    rec RECORD;
    v_daily_rate NUMERIC;
    v_hourly_rate NUMERIC;
    v_effective_work_days NUMERIC;
    v_base_earned NUMERIC;
    v_allowances_earned NUMERIC;
    v_overtime_pay NUMERIC;
    v_gross NUMERIC;
    v_tax NUMERIC;
    v_unpaid_deduction NUMERIC;
    v_net NUMERIC;
BEGIN
    FOR rec IN 
        SELECT 
            e.employee_id,
            s.salary_id,
            s.base_salary,
            s.hra,
            s.allowances,
            COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END), 0) AS present_days,
            COALESCE(SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END), 0) AS half_days,
            COALESCE(SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END), 0) AS leave_days,
            COALESCE(SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END), 0) AS absent_days,
            COALESCE(SUM(a.overtime_hours), 0.0) AS overtime_hours
        FROM Employee e
        JOIN Salary s ON e.employee_id = s.employee_id AND s.is_active = 1
        LEFT JOIN Attendance a ON e.employee_id = a.employee_id 
            AND EXTRACT(YEAR FROM a.attendance_date) = p_year
            AND EXTRACT(MONTH FROM a.attendance_date) = p_month
        WHERE e.status = 'ACTIVE'
        GROUP BY e.employee_id, s.salary_id, s.base_salary, s.hra, s.allowances
    LOOP
        -- 1. Rates
        v_daily_rate := ROUND(rec.base_salary / p_working_days::NUMERIC, 2);
        v_hourly_rate := ROUND(rec.base_salary / (p_working_days * 8.0)::NUMERIC, 2);
        
        -- 2. Prorated Days
        v_effective_work_days := rec.present_days + (rec.half_days * 0.5) + rec.leave_days;
        v_base_earned := ROUND(v_effective_work_days * v_daily_rate, 2);
        v_allowances_earned := ROUND((rec.hra + rec.allowances) * (v_effective_work_days / p_working_days::NUMERIC), 2);
        v_overtime_pay := ROUND(rec.overtime_hours * v_hourly_rate, 2);
        
        -- 3. Gross Salary
        v_gross := v_base_earned + v_allowances_earned + v_overtime_pay;
        
        -- 4. Taxes & Deductions
        v_tax := fn_calculate_tax(v_gross);
        v_unpaid_deduction := ROUND(rec.absent_days * v_daily_rate, 2);
        v_net := v_gross - v_tax - v_unpaid_deduction;

        -- 5. Insert / Update Payroll
        INSERT INTO Payroll (
            employee_id, salary_id, pay_period_month, pay_period_year,
            working_days, present_days, absent_days, half_days, leave_days,
            overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
            gross_salary, tax_deduction, unpaid_leave_deduction, other_deductions,
            net_salary, status, payment_date
        ) VALUES (
            rec.employee_id, rec.salary_id, p_month, p_year,
            p_working_days, rec.present_days, rec.absent_days, rec.half_days, rec.leave_days,
            rec.overtime_hours, v_base_earned, v_allowances_earned, v_overtime_pay,
            v_gross, v_tax, v_unpaid_deduction, 0.00,
            v_net, 'PAID', CURRENT_DATE
        )
        ON CONFLICT (employee_id, pay_period_year, pay_period_month)
        DO UPDATE SET
            gross_salary = EXCLUDED.gross_salary,
            tax_deduction = EXCLUDED.tax_deduction,
            net_salary = EXCLUDED.net_salary,
            updated_at = CURRENT_TIMESTAMP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
*/

-- ============================================================================
-- SECTION 3: MySQL 8.0 Stored Procedures & Functions (DELIMITER Dialect)
-- ============================================================================
-- Enterprise stored procedures for MySQL / MariaDB deployment.
-- ============================================================================

/*
DELIMITER //

-- Function: MySQL Progressive Tax Calculator
CREATE FUNCTION fn_calculate_tax_mysql(p_gross DECIMAL(10,2))
RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE v_tax DECIMAL(10,2) DEFAULT 0.00;
    
    IF p_gross <= 25000.00 THEN
        SET v_tax = 0.00;
    ELSEIF p_gross <= 50000.00 THEN
        SET v_tax = (p_gross - 25000.00) * 0.05;
    ELSEIF p_gross <= 100000.00 THEN
        SET v_tax = 1250.00 + ((p_gross - 50000.00) * 0.10);
    ELSE
        SET v_tax = 6250.00 + ((p_gross - 100000.00) * 0.15);
    END IF;
    
    RETURN ROUND(v_tax, 2);
END //

-- Stored Procedure: MySQL Monthly Payroll Calculation
CREATE PROCEDURE sp_process_monthly_payroll_mysql(
    IN p_year INT,
    IN p_month INT,
    IN p_working_days INT
)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_emp_id INT;
    DECLARE v_sal_id INT;
    DECLARE v_base DECIMAL(10,2);
    DECLARE v_hra DECIMAL(10,2);
    DECLARE v_allowances DECIMAL(10,2);
    DECLARE v_present DECIMAL(4,1);
    DECLARE v_half INT;
    DECLARE v_leave DECIMAL(4,1);
    DECLARE v_absent DECIMAL(4,1);
    DECLARE v_ot DECIMAL(5,2);
    
    DECLARE v_daily_rate DECIMAL(10,2);
    DECLARE v_hourly_rate DECIMAL(10,2);
    DECLARE v_effective_days DECIMAL(4,1);
    DECLARE v_base_earned DECIMAL(10,2);
    DECLARE v_allowances_earned DECIMAL(10,2);
    DECLARE v_ot_pay DECIMAL(10,2);
    DECLARE v_gross DECIMAL(10,2);
    DECLARE v_tax DECIMAL(10,2);
    DECLARE v_unpaid_ded DECIMAL(10,2);
    DECLARE v_net DECIMAL(10,2);
    
    DECLARE cur CURSOR FOR
        SELECT 
            e.employee_id, s.salary_id, s.base_salary, s.hra, s.allowances,
            COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(a.overtime_hours), 0.0)
        FROM Employee e
        JOIN Salary s ON e.employee_id = s.employee_id AND s.is_active = 1
        LEFT JOIN Attendance a ON e.employee_id = a.employee_id
            AND YEAR(a.attendance_date) = p_year
            AND MONTH(a.attendance_date) = p_month
        WHERE e.status = 'ACTIVE'
        GROUP BY e.employee_id, s.salary_id, s.base_salary, s.hra, s.allowances;
        
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_emp_id, v_sal_id, v_base, v_hra, v_allowances,
                       v_present, v_half, v_leave, v_absent, v_ot;
        IF done THEN
            LEAVE read_loop;
        END IF;

        SET v_daily_rate = ROUND(v_base / p_working_days, 2);
        SET v_hourly_rate = ROUND(v_base / (p_working_days * 8.0), 2);
        SET v_effective_days = v_present + (v_half * 0.5) + v_leave;
        SET v_base_earned = ROUND(v_effective_days * v_daily_rate, 2);
        SET v_allowances_earned = ROUND((v_hra + v_allowances) * (v_effective_days / p_working_days), 2);
        SET v_ot_pay = ROUND(v_ot * v_hourly_rate, 2);
        SET v_gross = v_base_earned + v_allowances_earned + v_ot_pay;
        SET v_tax = fn_calculate_tax_mysql(v_gross);
        SET v_unpaid_ded = ROUND(v_absent * v_daily_rate, 2);
        SET v_net = v_gross - v_tax - v_unpaid_ded;

        INSERT INTO Payroll (
            employee_id, salary_id, pay_period_month, pay_period_year,
            working_days, present_days, absent_days, half_days, leave_days,
            overtime_hours, base_salary_earned, allowances_earned, overtime_pay,
            gross_salary, tax_deduction, unpaid_leave_deduction, other_deductions,
            net_salary, status, payment_date
        ) VALUES (
            v_emp_id, v_sal_id, p_month, p_year,
            p_working_days, v_present, v_absent, v_half, v_leave,
            v_ot, v_base_earned, v_allowances_earned, v_ot_pay,
            v_gross, v_tax, v_unpaid_ded, 0.00,
            v_net, 'PAID', CURRENT_DATE()
        )
        ON DUPLICATE KEY UPDATE
            gross_salary = VALUES(gross_salary),
            tax_deduction = VALUES(tax_deduction),
            net_salary = VALUES(net_salary),
            updated_at = CURRENT_TIMESTAMP;
    END LOOP;
    CLOSE cur;
END //

DELIMITER ;
*/
