// ================================
// Core Data Types for Salary Tracker
// ================================

export interface Employee {
    id: string;
    name: string;
    role: string;
    department: string;
    monthlyPay: number;
    joinDate: string; // ISO date string
    status: 'active' | 'inactive';
    email?: string;
    phone?: string;
    avatarUrl?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string; // YYYY-MM-DD
    status: 'present' | 'absent' | 'leave' | 'holiday' | 'half-day';
    overtimeHours: number;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PayrollEntry {
    id: string;
    employeeId: string;
    month: string; // YYYY-MM
    daysWorked: number;
    halfDays: number;
    overtimeHours: number;
    deductions: number;
    basePay: number;
    overtimePay: number;
    netPay: number;
    status: 'draft' | 'approved' | 'paid';
    generatedAt: string;
    paidAt?: string;
}

export interface ShiftConfig {
    id: string;
    name: string;
    hoursPerDay: number;
    workingDaysPerMonth: number; // Default 31
    overtimeMultiplier: number; // Default 1x
    isDefault: boolean;
}

export interface Holiday {
    id: string;
    date: string; // YYYY-MM-DD
    name: string;
    isPaid: boolean;
}

export interface AppSettings {
    defaultShiftId: string;
    companyName: string;
    currency: string;
    currencySymbol: string;
    theme: 'dark' | 'light' | 'system';
    reducedMotion: boolean;
}

// ================================
// Computed Types
// ================================

export interface EmployeeWithPayroll extends Employee {
    currentMonthAttendance: AttendanceRecord[];
    currentPayroll?: PayrollEntry;
    hourlyRate: number;
}

export interface DashboardStats {
    totalEmployees: number;
    activeEmployees: number;
    presentToday: number;
    absentToday: number;
    onLeaveToday: number;
    pendingPayroll: number;
    totalMonthlyPayout: number;
    totalOvertimeHours: number;
}

export interface MonthlyReport {
    month: string;
    totalPayout: number;
    totalEmployees: number;
    averageAttendance: number;
    totalOvertimeHours: number;
    payrollEntries: PayrollEntry[];
}

// ================================
// Filter Types
// ================================

export type EmployeeStatus = 'all' | 'active' | 'inactive';
export type AttendanceStatus = 'all' | 'present' | 'absent' | 'leave' | 'holiday' | 'half-day';
export type PayrollStatus = 'all' | 'draft' | 'approved' | 'paid';

export interface EmployeeFilters {
    search: string;
    department: string;
    status: EmployeeStatus;
    role: string;
}

export interface FilterPill {
    id: string;
    label: string;
    value: string;
}

export interface AttendanceFilters {
    employeeId?: string;
    month: string; // YYYY-MM
    status: AttendanceStatus;
}

// ================================
// Form Types
// ================================

export interface EmployeeFormData {
    name: string;
    role: string;
    department: string;
    monthlyPay: number;
    joinDate: string;
    email?: string;
    phone?: string;
    notes?: string;
}

export interface BulkAttendanceData {
    date: string;
    employeeIds: string[];
    status: AttendanceRecord['status'];
    overtimeHours?: number;
}
