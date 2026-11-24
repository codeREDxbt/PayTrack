-- ============================================================================
-- PayTrack Enterprise Payroll & Attendance Management System
-- Database Triggers Definition (Phase 2 Procedural Implementation)
-- ============================================================================
-- Candidate Name : Vinayak
-- Roll Number    : 2501730150
-- Course         : Database Management Systems (CapStone Phase 2)
-- Engine Target  : SQLite 3 (node:sqlite / sqlite3)
-- Dialect Mirrors: PostgreSQL 14+ (PL/pgSQL) & MySQL 8.0+ (Triggers/DELIMITER)
-- ============================================================================

-- Ensure SQLite foreign key enforcement is active upon execution
PRAGMA foreign_keys = ON;

-- ============================================================================
-- SECTION 1: SQLite Production Triggers (Executable Engine)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger 1A: Prevent Overlapping Approved Leaves on INSERT
-- ----------------------------------------------------------------------------
-- Business Rule:
--   An employee cannot have overlapping leaves with status 'APPROVED'.
--   Two intervals [start1, end1] and [start2, end2] overlap if and only if:
--     start1 <= end2 AND end1 >= start2
-- Trigger Timing: BEFORE INSERT ON Leave FOR EACH ROW WHEN NEW.status = 'APPROVED'
-- Action: Abort transaction with RAISE(ABORT, message)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_prevent_leave_overlap_insert;
CREATE TRIGGER trg_prevent_leave_overlap_insert
BEFORE INSERT ON Leave
FOR EACH ROW
WHEN NEW.status = 'APPROVED'
BEGIN
    SELECT RAISE(ABORT, 'Error: Overlapping approved leave exists for this employee')
    WHERE EXISTS (
        SELECT 1 FROM Leave
        WHERE employee_id = NEW.employee_id
          AND status = 'APPROVED'
          AND start_date <= NEW.end_date
          AND end_date >= NEW.start_date
    );
END;

-- ----------------------------------------------------------------------------
-- Trigger 1B: Prevent Overlapping Approved Leaves on UPDATE
-- ----------------------------------------------------------------------------
-- Business Rule:
--   When updating a leave status to 'APPROVED' or modifying leave dates of an
--   approved record, ensure no conflict exists with *other* approved leaves.
-- Trigger Timing: BEFORE UPDATE ON Leave FOR EACH ROW WHEN NEW.status = 'APPROVED'
-- Action: Abort transaction if another approved record overlaps (leave_id != NEW.leave_id)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_prevent_leave_overlap_update;
CREATE TRIGGER trg_prevent_leave_overlap_update
BEFORE UPDATE ON Leave
FOR EACH ROW
WHEN NEW.status = 'APPROVED'
BEGIN
    SELECT RAISE(ABORT, 'Error: Overlapping approved leave exists for this employee')
    WHERE EXISTS (
        SELECT 1 FROM Leave
        WHERE employee_id = NEW.employee_id
          AND status = 'APPROVED'
          AND leave_id != NEW.leave_id
          AND start_date <= NEW.end_date
          AND end_date >= NEW.start_date
    );
END;

-- ----------------------------------------------------------------------------
-- Trigger 2A: Validate Attendance Bounds & Business Rules on INSERT
-- ----------------------------------------------------------------------------
-- Business Rules:
--   1. Reject future attendance dates (attendance_date > CURRENT_DATE).
--   2. Reject overtime hours if employee status is 'ABSENT' (cannot work overtime while absent).
--   3. Validate hours_worked <= 24 and overtime_hours <= 16.
-- Trigger Timing: BEFORE INSERT ON Attendance FOR EACH ROW
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_attendance_bounds_insert;
CREATE TRIGGER trg_validate_attendance_bounds_insert
BEFORE INSERT ON Attendance
FOR EACH ROW
BEGIN
    -- Rule 1: Reject future attendance dates
    SELECT RAISE(ABORT, 'Error: Attendance date cannot be in the future')
    WHERE NEW.attendance_date > CURRENT_DATE;

    -- Rule 2: Reject overtime when status is ABSENT
    SELECT RAISE(ABORT, 'Error: Overtime hours cannot be clocked for an ABSENT employee')
    WHERE NEW.status = 'ABSENT' AND NEW.overtime_hours > 0.00;

    -- Rule 3: Reject overtime exceeding hours worked
    SELECT RAISE(ABORT, 'Error: Overtime hours cannot exceed total hours worked')
    WHERE NEW.overtime_hours > NEW.hours_worked;
END;

-- ----------------------------------------------------------------------------
-- Trigger 2B: Validate Attendance Bounds & Business Rules on UPDATE
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_attendance_bounds_update;
CREATE TRIGGER trg_validate_attendance_bounds_update
BEFORE UPDATE ON Attendance
FOR EACH ROW
BEGIN
    -- Rule 1: Reject future attendance dates
    SELECT RAISE(ABORT, 'Error: Attendance date cannot be in the future')
    WHERE NEW.attendance_date > CURRENT_DATE;

    -- Rule 2: Reject overtime when status is ABSENT
    SELECT RAISE(ABORT, 'Error: Overtime hours cannot be clocked for an ABSENT employee')
    WHERE NEW.status = 'ABSENT' AND NEW.overtime_hours > 0.00;

    -- Rule 3: Reject overtime exceeding hours worked
    SELECT RAISE(ABORT, 'Error: Overtime hours cannot exceed total hours worked')
    WHERE NEW.overtime_hours > NEW.hours_worked;
END;

-- ----------------------------------------------------------------------------
-- Trigger 3A: Auto Late Mark & Minutes Calculation on INSERT
-- ----------------------------------------------------------------------------
-- Business Rule:
--   Official workday begins at 09:30:00 (570 minutes past midnight).
--   If check_in_time > '09:30:00', automatically mark is_late = 1
--   and calculate late_minutes = (HH * 60 + MM) - 570.
-- Trigger Timing: AFTER INSERT ON Attendance FOR EACH ROW
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_late_mark_insert;
CREATE TRIGGER trg_auto_late_mark_insert
AFTER INSERT ON Attendance
FOR EACH ROW
WHEN NEW.check_in_time IS NOT NULL 
 AND NEW.check_in_time > '09:30:00' 
 AND (NEW.is_late = 0 OR NEW.late_minutes = 0)
BEGIN
    UPDATE Attendance
    SET is_late = 1,
        late_minutes = CAST((strftime('%H', NEW.check_in_time) * 60 + strftime('%M', NEW.check_in_time) - 570) AS INTEGER)
    WHERE attendance_id = NEW.attendance_id;
END;

-- ----------------------------------------------------------------------------
-- Trigger 3B: Auto Late Mark & Minutes Calculation on UPDATE
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_late_mark_update;
CREATE TRIGGER trg_auto_late_mark_update
AFTER UPDATE OF check_in_time ON Attendance
FOR EACH ROW
WHEN NEW.check_in_time IS NOT NULL 
 AND NEW.check_in_time > '09:30:00'
BEGIN
    UPDATE Attendance
    SET is_late = 1,
        late_minutes = CAST((strftime('%H', NEW.check_in_time) * 60 + strftime('%M', NEW.check_in_time) - 570) AS INTEGER)
    WHERE attendance_id = NEW.attendance_id;
END;

-- ----------------------------------------------------------------------------
-- Trigger 3C: Reset Late Mark on UPDATE if Check-in is Corrected to On-Time
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_reset_late_mark_update;
CREATE TRIGGER trg_reset_late_mark_update
AFTER UPDATE OF check_in_time ON Attendance
FOR EACH ROW
WHEN (NEW.check_in_time IS NULL OR NEW.check_in_time <= '09:30:00')
 AND (NEW.is_late = 1 OR NEW.late_minutes > 0)
BEGIN
    UPDATE Attendance
    SET is_late = 0,
        late_minutes = 0
    WHERE attendance_id = NEW.attendance_id;
END;

-- ============================================================================
-- SECTION 2: PostgreSQL Dialect Reference (PL/pgSQL Academic Specification)
-- ============================================================================
-- The following PL/pgSQL triggers provide the formal theoretical and enterprise
-- implementation for PostgreSQL databases.
-- ============================================================================

/*
-- PostgreSQL Trigger 1: Overlapping Leave Check Function
CREATE OR REPLACE FUNCTION fn_trg_prevent_leave_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'APPROVED' THEN
        IF EXISTS (
            SELECT 1 FROM Leave
            WHERE employee_id = NEW.employee_id
              AND status = 'APPROVED'
              AND leave_id IS DISTINCT FROM NEW.leave_id
              AND start_date <= NEW.end_date
              AND end_date >= NEW.start_date
        ) THEN
            RAISE EXCEPTION 'Error: Overlapping approved leave exists for employee ID %', NEW.employee_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_leave_overlap_pg
BEFORE INSERT OR UPDATE ON Leave
FOR EACH ROW
EXECUTE FUNCTION fn_trg_prevent_leave_overlap();

-- PostgreSQL Trigger 2: Attendance Bounds Validation Function
CREATE OR REPLACE FUNCTION fn_trg_validate_attendance_bounds()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.attendance_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Error: Attendance date % cannot be in the future', NEW.attendance_date;
    END IF;

    IF NEW.status = 'ABSENT' AND NEW.overtime_hours > 0.00 THEN
        RAISE EXCEPTION 'Error: Overtime hours cannot be clocked for an ABSENT employee';
    END IF;

    IF NEW.overtime_hours > NEW.hours_worked THEN
        RAISE EXCEPTION 'Error: Overtime hours cannot exceed total hours worked';
    END IF;

    -- Auto Late Mark Calculation in PostgreSQL BEFORE trigger
    IF NEW.check_in_time IS NOT NULL AND NEW.check_in_time > '09:30:00'::TIME THEN
        NEW.is_late := 1;
        NEW.late_minutes := EXTRACT(HOUR FROM (NEW.check_in_time - '09:30:00'::TIME)) * 60 +
                            EXTRACT(MINUTE FROM (NEW.check_in_time - '09:30:00'::TIME));
    ELSE
        NEW.is_late := 0;
        NEW.late_minutes := 0;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_attendance_bounds_pg
BEFORE INSERT OR UPDATE ON Attendance
FOR EACH ROW
EXECUTE FUNCTION fn_trg_validate_attendance_bounds();
*/

-- ============================================================================
-- SECTION 3: MySQL 8.0 Dialect Reference (SIGNAL SQLSTATE Academic Specification)
-- ============================================================================
-- The following triggers provide the formal theoretical and enterprise
-- implementation for MySQL / MariaDB databases.
-- ============================================================================

/*
DELIMITER //

-- MySQL Trigger 1: Overlapping Leave Check on INSERT
CREATE TRIGGER trg_prevent_leave_overlap_mysql_insert
BEFORE INSERT ON Leave
FOR EACH ROW
BEGIN
    DECLARE overlap_count INT DEFAULT 0;
    IF NEW.status = 'APPROVED' THEN
        SELECT COUNT(*) INTO overlap_count
        FROM Leave
        WHERE employee_id = NEW.employee_id
          AND status = 'APPROVED'
          AND start_date <= NEW.end_date
          AND end_date >= NEW.start_date;
          
        IF overlap_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Error: Overlapping approved leave exists for this employee';
        END IF;
    END IF;
END //

-- MySQL Trigger 2: Attendance Bounds & Auto Late Mark on INSERT
CREATE TRIGGER trg_validate_attendance_bounds_mysql_insert
BEFORE INSERT ON Attendance
FOR EACH ROW
BEGIN
    IF NEW.attendance_date > CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error: Attendance date cannot be in the future';
    END IF;

    IF NEW.status = 'ABSENT' AND NEW.overtime_hours > 0.00 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Error: Overtime hours cannot be clocked for an ABSENT employee';
    END IF;

    IF NEW.check_in_time IS NOT NULL AND NEW.check_in_time > '09:30:00' THEN
        SET NEW.is_late = 1;
        SET NEW.late_minutes = TIME_TO_SEC(TIMEDIFF(NEW.check_in_time, '09:30:00')) / 60;
    ELSE
        SET NEW.is_late = 0;
        SET NEW.late_minutes = 0;
    END IF;
END //

DELIMITER ;
*/
