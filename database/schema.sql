-- ============================================================================
-- PayTrack Enterprise Payroll & Attendance Management System
-- Database Schema Definition (Phase 1 Relational Data Model)
-- ============================================================================
-- Engine Compatibility:
--   - Native Primary Execution: SQLite 3 (node:sqlite / sqlite3)
--   - Dialect Annotations: ANSI SQL-92 / PostgreSQL 14+ / MySQL 8.0+
-- Standards Adherence:
--   - Normal Form: 3NF (Third Normal Form) Certified
--   - Foreign Key Cascades & Constraints: Full Referential Integrity
-- ============================================================================

-- Ensure SQLite foreign key enforcement is active upon script execution
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Table 1: Employee (Master Workforce Entity)
-- ============================================================================
-- Represents the core organization staff directory.
-- Compatibility Notes:
--   - SQLite: INTEGER PRIMARY KEY AUTOINCREMENT
--   - PostgreSQL: employee_id SERIAL PRIMARY KEY / BIGSERIAL
--   - MySQL: employee_id INT AUTO_INCREMENT PRIMARY KEY
-- ============================================================================
DROP TABLE IF EXISTS Employee;
CREATE TABLE Employee (
    employee_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT,
    department      TEXT NOT NULL,
    role            TEXT NOT NULL,
    system_role     TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (system_role IN ('ADMIN', 'HR', 'EMPLOYEE')),
    join_date       TEXT NOT NULL, -- ISO-8601 Date: YYYY-MM-DD
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'TERMINATED')),
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Table 2: Salary (Employee Compensation Structure / CTC Configuration)
-- ============================================================================
-- Maintains employee contracted compensation packages. Supports historical revisions.
-- Cardinality: Employee (1) -> (1..N) Salary (1 active record per employee)
-- Compatibility Notes:
--   - SQLite: REAL / NUMERIC / DECIMAL(10,2) stored as numeric representations
--   - PostgreSQL: NUMERIC(10,2)
--   - MySQL: DECIMAL(10,2)
-- ============================================================================
DROP TABLE IF EXISTS Salary;
CREATE TABLE Salary (
    salary_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    base_salary     DECIMAL(10,2) NOT NULL CHECK (base_salary >= 0.00),
    hra             DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (hra >= 0.00),
    allowances      DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (allowances >= 0.00),
    effective_date  TEXT NOT NULL, -- ISO-8601 Date: YYYY-MM-DD
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_salary_employee
        FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================================
-- Table 3: Attendance (Daily Clocking & Time Tracking Log)
-- ============================================================================
-- Records daily work shifts, check-in/out timestamps, hours, overtime, and tardiness.
-- Cardinality: Employee (1) -> (0..N) Attendance
-- Constraints: UNIQUE(employee_id, attendance_date) prevents duplicate daily logs.
-- Compatibility Notes:
--   - SQLite: check_in_time / check_out_time stored as TEXT (HH:MM:SS)
--   - PostgreSQL: check_in_time TIME, check_out_time TIME
--   - MySQL: check_in_time TIME, check_out_time TIME
-- ============================================================================
DROP TABLE IF EXISTS Attendance;
CREATE TABLE Attendance (
    attendance_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    attendance_date TEXT NOT NULL, -- ISO-8601 Date: YYYY-MM-DD
    status          TEXT NOT NULL DEFAULT 'PRESENT' 
                    CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY')),
    check_in_time   TEXT,          -- HH:MM:SS format
    check_out_time  TEXT,          -- HH:MM:SS format
    hours_worked    DECIMAL(4,2) NOT NULL DEFAULT 0.00 
                    CHECK (hours_worked >= 0.00 AND hours_worked <= 24.00),
    overtime_hours  DECIMAL(4,2) NOT NULL DEFAULT 0.00 
                    CHECK (overtime_hours >= 0.00 AND overtime_hours <= 16.00),
    is_late         INTEGER NOT NULL DEFAULT 0 CHECK (is_late IN (0, 1)),
    late_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_employee
        FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_attendance_emp_date
        UNIQUE (employee_id, attendance_date)
);

-- ============================================================================
-- Table 4: Leave (Formal Leave Requests & Approvals)
-- ============================================================================
-- Tracks leave applications, duration, categorization, and management approvals.
-- Cardinality: 
--   - Employee (1) -> (0..N) Leave (applicant)
--   - Employee (1) -> (0..N) Leave (approved_by manager self-reference)
-- Constraints: CHECK (end_date >= start_date) prevents inverted date ranges.
-- ============================================================================
DROP TABLE IF EXISTS Leave;
CREATE TABLE Leave (
    leave_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    leave_type      TEXT NOT NULL 
                    CHECK (leave_type IN ('CASUAL', 'SICK', 'EARNED', 'UNPAID')),
    start_date      TEXT NOT NULL, -- ISO-8601 Date: YYYY-MM-DD
    end_date        TEXT NOT NULL, -- ISO-8601 Date: YYYY-MM-DD
    total_days      DECIMAL(4,1) NOT NULL CHECK (total_days > 0.0),
    status          TEXT NOT NULL DEFAULT 'PENDING' 
                    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    reason          TEXT,
    approved_by     INTEGER,
    applied_on      TEXT DEFAULT CURRENT_TIMESTAMP,
    decided_on      TEXT,
    CONSTRAINT fk_leave_employee
        FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_leave_approver
        FOREIGN KEY (approved_by) REFERENCES Employee(employee_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_leave_date_range
        CHECK (end_date >= start_date)
);

-- ============================================================================
-- Table 5: Payroll (Monthly Transactional Payout Ledger / Payslip Snapshot)
-- ============================================================================
-- Records finalized periodic compensation, progressive tax withholding, and net disbursements.
-- 3NF Snapshot Rationale:
--   Preserves immutable historical financial records reflecting actual payout at transaction time,
--   immune to retroactive salary modifications or tax slab alterations.
-- Cardinality: 
--   - Employee (1) -> (0..N) Payroll
--   - Salary (1) -> (0..N) Payroll
-- Constraints: UNIQUE(employee_id, pay_period_year, pay_period_month) prevents duplicate monthly payslips.
-- ============================================================================
DROP TABLE IF EXISTS Payroll;
CREATE TABLE Payroll (
    payroll_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id             INTEGER NOT NULL,
    salary_id               INTEGER NOT NULL,
    pay_period_month        INTEGER NOT NULL CHECK (pay_period_month >= 1 AND pay_period_month <= 12),
    pay_period_year         INTEGER NOT NULL CHECK (pay_period_year >= 2020),
    working_days            INTEGER NOT NULL DEFAULT 0 CHECK (working_days >= 0),
    present_days            DECIMAL(4,1) NOT NULL DEFAULT 0.0 CHECK (present_days >= 0.0),
    absent_days             DECIMAL(4,1) NOT NULL DEFAULT 0.0 CHECK (absent_days >= 0.0),
    half_days               INTEGER NOT NULL DEFAULT 0 CHECK (half_days >= 0),
    leave_days              DECIMAL(4,1) NOT NULL DEFAULT 0.0 CHECK (leave_days >= 0.0),
    overtime_hours          DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (overtime_hours >= 0.00),
    base_salary_earned      DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (base_salary_earned >= 0.00),
    allowances_earned       DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (allowances_earned >= 0.00),
    overtime_pay            DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (overtime_pay >= 0.00),
    gross_salary            DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (gross_salary >= 0.00),
    tax_deduction           DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (tax_deduction >= 0.00),
    unpaid_leave_deduction  DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (unpaid_leave_deduction >= 0.00),
    other_deductions        DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (other_deductions >= 0.00),
    net_salary              DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (net_salary >= 0.00),
    status                  TEXT NOT NULL DEFAULT 'DRAFT' 
                            CHECK (status IN ('DRAFT', 'APPROVED', 'PAID')),
    payment_date            TEXT, -- ISO-8601 Date: YYYY-MM-DD
    created_at              TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at              TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payroll_employee
        FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payroll_salary
        FOREIGN KEY (salary_id) REFERENCES Salary(salary_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_payroll_employee_period
        UNIQUE (employee_id, pay_period_year, pay_period_month)
);

-- ============================================================================
-- Performance B-Tree Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_employee_email ON Employee(email);
CREATE INDEX IF NOT EXISTS idx_employee_department ON Employee(department);
CREATE INDEX IF NOT EXISTS idx_employee_status ON Employee(status);
CREATE INDEX IF NOT EXISTS idx_salary_emp_active ON Salary(employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON Attendance(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date_late ON Attendance(attendance_date, is_late);
CREATE INDEX IF NOT EXISTS idx_leave_emp_dates_status ON Leave(employee_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_payroll_emp_period ON Payroll(employee_id, pay_period_year, pay_period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_status ON Payroll(status);
