// ================================
// Salary Calculator Utility
// Hourly rate from monthly pay (31-day basis)
// ================================

import type { Employee, AttendanceRecord, ShiftConfig, PayrollEntry } from '../lib/types';

/**
 * Calculate hourly rate from monthly pay
 * Formula: monthlyPay / (workingDaysPerMonth * hoursPerDay)
 */
export function calculateHourlyRate(
    monthlyPay: number,
    workingDaysPerMonth: number = 31,
    hoursPerDay: number = 8
): number {
    if (workingDaysPerMonth <= 0 || hoursPerDay <= 0) return 0;
    return monthlyPay / (workingDaysPerMonth * hoursPerDay);
}

/**
 * Calculate payroll for an employee based on attendance
 */
export function calculatePayroll(
    employee: Employee,
    attendance: AttendanceRecord[],
    shiftConfig: ShiftConfig
): Omit<PayrollEntry, 'id' | 'generatedAt' | 'paidAt'> {
    const { hoursPerDay, workingDaysPerMonth, overtimeMultiplier } = shiftConfig;

    // Calculate hourly rate
    const hourlyRate = calculateHourlyRate(employee.monthlyPay, workingDaysPerMonth, hoursPerDay);

    // Count attendance
    let daysWorked = 0;
    let halfDays = 0;
    let totalOvertimeHours = 0;

    for (const record of attendance) {
        switch (record.status) {
            case 'present':
                daysWorked++;
                break;
            case 'half-day':
                halfDays++;
                break;
            case 'holiday':
                // Paid holiday counts as worked day
                daysWorked++;
                break;
        }
        totalOvertimeHours += record.overtimeHours || 0;
    }

    // Calculate pay
    const effectiveDays = daysWorked + (halfDays * 0.5);
    const basePay = effectiveDays * hoursPerDay * hourlyRate;
    const overtimePay = totalOvertimeHours * hourlyRate * overtimeMultiplier;

    return {
        employeeId: employee.id,
        month: new Date().toISOString().slice(0, 7), // YYYY-MM
        daysWorked,
        halfDays,
        overtimeHours: totalOvertimeHours,
        deductions: 0, // Can be set separately
        basePay: Math.round(basePay * 100) / 100,
        overtimePay: Math.round(overtimePay * 100) / 100,
        netPay: Math.round((basePay + overtimePay) * 100) / 100,
        status: 'draft',
    };
}

/**
 * Format currency with Indian Rupee formatting
 */
export function formatCurrency(amount: number, symbol: string = '₹'): string {
    return `${symbol}${amount.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Calculate attendance percentage for display
 */
export function calculateAttendancePercentage(
    daysWorked: number,
    halfDays: number,
    totalDays: number
): number {
    if (totalDays <= 0) return 0;
    const effectiveDays = daysWorked + (halfDays * 0.5);
    return Math.round((effectiveDays / totalDays) * 100);
}

/**
 * Get default shift configuration
 */
export function getDefaultShiftConfig(): ShiftConfig {
    return {
        id: 'default',
        name: 'Standard Shift',
        hoursPerDay: 8,
        workingDaysPerMonth: 31,
        overtimeMultiplier: 1, // 1x as per user requirement
        isDefault: true,
    };
}
