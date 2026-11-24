// ================================
// PayTrack API Types
// ================================
// These mirror the Phase 5 REST contract in docs/phase-5/api-reference.md and the
// Phase 1 schema in database/schema.sql. The UI never invents a field the
// server does not return.

export type SystemRole = 'ADMIN' | 'HR' | 'EMPLOYEE';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY';
export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export interface AuthUser {
    employeeId: number;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string | null;
    department: string;
    jobTitle: string;
    systemRole: SystemRole;
    roles: SystemRole[];
    isStaff: boolean;
    employeeStatus: EmployeeStatus;
    joinDate: string;
    lastLoginAt: string | null;
    permissions: string[];
}

export interface Employee {
    employeeId: number;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string | null;
    department: string;
    jobTitle: string;
    systemRole: SystemRole;
    joinDate: string;
    status: EmployeeStatus;
    createdAt: string;
    updatedAt: string;
}

export interface AttendanceRecord {
    attendanceId: number;
    employeeId: number;
    employeeName?: string;
    department?: string;
    date: string;
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
    hoursWorked: number;
    overtimeHours: number;
    isLate: boolean;
    lateMinutes: number;
}

export interface PayrollEntry {
    payrollId: number;
    employeeId: number;
    employeeName: string;
    email: string;
    department: string;
    month: string;
    periodYear: number;
    periodMonth: number;
    workingDays: number;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    leaveDays: number;
    overtimeHours: number;
    grossSalary: number;
    taxDeduction: number;
    unpaidLeaveDeduction: number;
    otherDeductions: number;
    netSalary: number;
    status: PayrollStatus;
    paymentDate: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface PayslipLineItem {
    sortOrder: number;
    itemType: 'EARNING' | 'DEDUCTION';
    code: string;
    label: string;
    amount: number;
}

export interface Payslip {
    payrollId: number;
    employee: {
        employeeId: number;
        fullName: string;
        email: string;
        department: string;
        jobTitle: string;
    };
    month: string;
    periodLabel: string;
    status: PayrollStatus;
    paymentDate: string | null;
    salaryPackage: {
        salaryId: number;
        baseSalary: number;
        hra: number;
        allowances: number;
    };
    attendance: {
        workingDays: number;
        presentDays: number;
        halfDays: number;
        leaveDays: number;
        absentDays: number;
        overtimeHours: number;
    };
    earnings: {
        baseSalaryEarned: number;
        allowancesEarned: number;
        overtimePay: number;
        grossSalary: number;
    };
    deductions: {
        taxDeduction: number;
        unpaidLeaveDeduction: number;
        otherDeductions: number;
        totalDeductions: number;
    };
    netSalary: number;
    computedNetSalary: number;
    lineItems: PayslipLineItem[];
    generatedAt: string;
}

export interface DashboardAttendance {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    halfDays: number;
    lateMarks: number;
    overtimeHours: number;
}

export interface Dashboard {
    scope: 'ORG' | 'SELF';
    month: string;
    headcount: number;
    employeesLogged: number;
    departments?: number;
    attendance: DashboardAttendance;
    payroll: {
        slips: number;
        paidSlips: number;
        paidNetSalary: number;
    };
}

/** Raw view row from vw_rpt_department_rollup (snake_case on purpose). */
export interface DepartmentRollup {
    department: string;
    month_key: string;
    employees_logged: number;
    present_days: number;
    half_days: number;
    leave_days: number;
    absent_days: number;
    holiday_days: number;
    overtime_hours: number;
    late_marks: number;
    avg_attendance_percentage: number | null;
    payroll_slips: number;
    paid_slips: number;
    paid_gross_salary: number;
    paid_tax_deduction: number;
    paid_net_salary: number;
    approved_net_salary: number;
}

export interface MonthlyReport {
    month: string;
    departments: DepartmentRollup[];
    totals: {
        presentDays: number;
        absentDays: number;
        leaveDays: number;
        lateMarks: number;
        overtimeHours: number;
        payroll: {
            slips: number;
            draft: number;
            approved: number;
            paid: number;
            grossSalary: number;
            taxDeduction: number;
            netSalary: number;
        };
    };
}

/** Raw view row from vw_employee_attendance_monthly_summary. */
export interface AttendanceSummaryRow {
    employee_id: number;
    employee_name: string;
    department: string;
    role: string;
    month_key: string;
    total_logged_days: number;
    present_days: number;
    half_days: number;
    leave_days: number;
    absent_days: number;
    holiday_days: number;
    total_overtime_hours: number;
    total_late_marks: number;
}

/** Raw view row from vw_rpt_late_marks. */
export interface LateMark {
    attendance_id: number;
    employee_id: number;
    employee_name: string;
    department: string;
    attendance_date: string;
    day_of_week_name: string;
    check_in_time: string | null;
    late_minutes: number;
}

export interface TrendPoint {
    month: string;
    label: string;
    total: number;
}

export interface FilterPill {
    id: string;
    label: string;
    value: string;
}

// ================================
// Request payloads
// ================================

export interface CreateEmployeeInput {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    department: string;
    role: string;
    systemRole: SystemRole;
    joinDate: string;
    status: EmployeeStatus;
    baseSalary: number;
    hra?: number;
    allowances?: number;
    effectiveDate?: string;
}

export type UpdateEmployeeInput = Partial<
    Pick<
        CreateEmployeeInput,
        'firstName' | 'lastName' | 'email' | 'phone' | 'department' | 'role' | 'systemRole' | 'joinDate' | 'status'
    >
>;

export interface CreateAttendanceInput {
    employeeId: number;
    date: string;
    status: AttendanceStatus;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    hoursWorked?: number;
    overtimeHours?: number;
}

export interface UpdateAttendanceInput {
    status?: AttendanceStatus;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    hoursWorked?: number;
    overtimeHours?: number;
}
