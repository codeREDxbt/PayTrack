import { useMemo, useState } from 'react';
import {
    Calculator,
    Download,
    FileText,
    Check,
    Clock,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button, Card, Select, MetricCard } from '../components/ui';
import { formatCurrency, getDefaultShiftConfig } from '../utils/salaryCalculator';
import type { Employee, PayrollEntry } from '../lib/types';
import { generateId } from '../lib/utils';

// ================================
// Payroll Page
// Salary calculation and payslips
// ================================

// Mock employees for demo
const mockEmployees: Employee[] = [
    { id: '1', name: 'Rahul Sharma', role: 'Senior Developer', department: 'Engineering', monthlyPay: 75000, joinDate: '2023-03-15', status: 'active', createdAt: '', updatedAt: '' },
    { id: '2', name: 'Priya Patel', role: 'Marketing Manager', department: 'Marketing', monthlyPay: 85000, joinDate: '2022-08-01', status: 'active', createdAt: '', updatedAt: '' },
    { id: '3', name: 'Amit Kumar', role: 'Sales Lead', department: 'Sales', monthlyPay: 70000, joinDate: '2023-01-10', status: 'active', createdAt: '', updatedAt: '' },
    { id: '4', name: 'Sunita Gupta', role: 'HR Manager', department: 'HR', monthlyPay: 65000, joinDate: '2021-06-20', status: 'active', createdAt: '', updatedAt: '' },
    { id: '5', name: 'Vikram Singh', role: 'Junior Developer', department: 'Engineering', monthlyPay: 45000, joinDate: '2024-01-05', status: 'active', createdAt: '', updatedAt: '' },
];

// Generate mock payroll data
const generateMockPayroll = (employees: Employee[], month: string): PayrollEntry[] => {
    return employees.map((emp) => {
        const daysWorked = Math.floor(Math.random() * 5) + 26;
        const halfDays = Math.floor(Math.random() * 2);
        const overtimeHours = Math.floor(Math.random() * 15);
        const shiftConfig = getDefaultShiftConfig();

        const hourlyRate = emp.monthlyPay / (shiftConfig.workingDaysPerMonth * shiftConfig.hoursPerDay);
        const effectiveDays = daysWorked + (halfDays * 0.5);
        const basePay = effectiveDays * shiftConfig.hoursPerDay * hourlyRate;
        const overtimePay = overtimeHours * hourlyRate * shiftConfig.overtimeMultiplier;
        const deductions = Math.floor(Math.random() * 2000);

        return {
            id: generateId(),
            employeeId: emp.id,
            month,
            daysWorked,
            halfDays,
            overtimeHours,
            deductions,
            basePay: Math.round(basePay),
            overtimePay: Math.round(overtimePay),
            netPay: Math.round(basePay + overtimePay - deductions),
            status: Math.random() > 0.3 ? 'approved' : 'draft',
            generatedAt: new Date().toISOString(),
        };
    });
};

const MONTHS = [
    { value: '2026-02', label: 'February 2026' },
    { value: '2026-01', label: 'January 2026' },
    { value: '2025-12', label: 'December 2025' },
];

export function Payroll() {
    const { employees, shiftConfig, currentMonth } = useApp();
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedDepartment, setSelectedDepartment] = useState('');

    const displayEmployees = employees.length > 0 ? employees : mockEmployees;

    const payrollData = useMemo(() => {
        return generateMockPayroll(displayEmployees, selectedMonth);
    }, [displayEmployees, selectedMonth]);

    const filteredPayroll = useMemo(() => {
        if (!selectedDepartment) return payrollData;
        return payrollData.filter((entry) => {
            const emp = displayEmployees.find((e) => e.id === entry.employeeId);
            return emp?.department.toLowerCase() === selectedDepartment.toLowerCase();
        });
    }, [payrollData, selectedDepartment, displayEmployees]);

    const totals = useMemo(() => {
        return filteredPayroll.reduce(
            (acc, entry) => ({
                basePay: acc.basePay + entry.basePay,
                overtimePay: acc.overtimePay + entry.overtimePay,
                deductions: acc.deductions + entry.deductions,
                netPay: acc.netPay + entry.netPay,
                pending: acc.pending + (entry.status === 'draft' ? 1 : 0),
                approved: acc.approved + (entry.status === 'approved' ? 1 : 0),
            }),
            { basePay: 0, overtimePay: 0, deductions: 0, netPay: 0, pending: 0, approved: 0 }
        );
    }, [filteredPayroll]);

    const getEmployee = (id: string) => displayEmployees.find((e) => e.id === id);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">Payroll</h1>
                    <p className="text-[--color-text-secondary] mt-1">Calculate and manage employee salaries</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm">
                        <Download className="w-4 h-4" />
                        Export All
                    </Button>
                    <Button variant="primary" size="sm">
                        <Calculator className="w-4 h-4" />
                        Run Payroll
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Total Payout" value={formatCurrency(totals.netPay)} accentColor="gold" />
                <MetricCard label="Base Pay Total" value={formatCurrency(totals.basePay)} accentColor="blue" />
                <MetricCard label="Overtime Pay" value={formatCurrency(totals.overtimePay)} accentColor="success" />
                <MetricCard label="Pending Approval" value={`${totals.pending} employees`} accentColor="warning" />
            </div>

            <Card padding="md" variant="elevated">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-[--color-accent-gold]/10 rounded-[--radius-lg]">
                        <Calculator className="w-6 h-6 text-[--color-accent-gold]" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-medium text-[--color-text-primary]">Salary Calculation Formula</h3>
                        <div className="mt-2 p-3 bg-[--color-bg-tertiary] rounded-[--radius-md] font-mono text-sm">
                            <p className="text-[--color-text-secondary]">
                                <span className="text-[--color-accent-blue]">Hourly Rate</span> = Monthly Pay ÷ ({shiftConfig.workingDaysPerMonth} days × {shiftConfig.hoursPerDay} hrs)
                            </p>
                            <p className="text-[--color-text-secondary] mt-1">
                                <span className="text-[--color-success]">Base Pay</span> = Days Worked × {shiftConfig.hoursPerDay} hrs × Hourly Rate
                            </p>
                            <p className="text-[--color-text-secondary] mt-1">
                                <span className="text-[--color-warning]">Overtime</span> = OT Hours × Hourly Rate × {shiftConfig.overtimeMultiplier}x
                            </p>
                            <p className="text-[--color-text-primary] mt-1 font-semibold">
                                <span className="text-[--color-accent-gold]">Net Pay</span> = Base Pay + Overtime − Deductions
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            <Card padding="md">
                <div className="flex items-center gap-4">
                    <Select label="Month" options={MONTHS} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-48" />
                    <Select
                        label="Department"
                        options={[
                            { value: '', label: 'All Departments' },
                            { value: 'engineering', label: 'Engineering' },
                            { value: 'sales', label: 'Sales' },
                            { value: 'marketing', label: 'Marketing' },
                            { value: 'hr', label: 'HR' },
                            { value: 'finance', label: 'Finance' },
                        ]}
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="w-48"
                    />
                </div>
            </Card>

            <Card padding="none">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[--color-border]">
                                <th className="text-left text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Employee</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Days Worked</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Overtime</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Base Pay</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">OT Pay</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Deductions</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Net Pay</th>
                                <th className="text-center text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Status</th>
                                <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[--color-border]">
                            {filteredPayroll.map((entry) => {
                                const employee = getEmployee(entry.employeeId);
                                if (!employee) return null;

                                return (
                                    <tr key={entry.id} className="hover:bg-[--color-bg-tertiary] transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center text-[--color-accent-gold] text-sm font-medium">
                                                    {employee.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-[--color-text-primary]">{employee.name}</p>
                                                    <p className="text-xs text-[--color-text-muted]">{formatCurrency(employee.monthlyPay)}/month</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-[--color-text-secondary]">
                                            {entry.daysWorked}{entry.halfDays > 0 && <span className="text-[--color-text-muted]"> + {entry.halfDays}½</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-[--color-accent-blue]">{entry.overtimeHours} hrs</td>
                                        <td className="px-4 py-3 text-right text-sm text-[--color-text-secondary]">{formatCurrency(entry.basePay)}</td>
                                        <td className="px-4 py-3 text-right text-sm text-[--color-success]">+{formatCurrency(entry.overtimePay)}</td>
                                        <td className="px-4 py-3 text-right text-sm text-[--color-danger]">-{formatCurrency(entry.deductions)}</td>
                                        <td className="px-4 py-3 text-right text-sm font-semibold text-[--color-accent-gold]">{formatCurrency(entry.netPay)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${entry.status === 'approved' ? 'bg-[--color-success]/10 text-[--color-success]' : 'bg-[--color-warning]/10 text-[--color-warning]'}`}>
                                                {entry.status === 'approved' ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {entry.status === 'approved' ? 'Approved' : 'Pending'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Button variant="ghost" size="sm">
                                                <FileText className="w-4 h-4" />
                                                Payslip
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-[--color-bg-tertiary] border-t-2 border-[--color-border]">
                                <td className="px-4 py-3 font-semibold text-[--color-text-primary]">Total ({filteredPayroll.length} employees)</td>
                                <td colSpan={2} />
                                <td className="px-4 py-3 text-right font-semibold text-[--color-text-primary]">{formatCurrency(totals.basePay)}</td>
                                <td className="px-4 py-3 text-right font-semibold text-[--color-success]">+{formatCurrency(totals.overtimePay)}</td>
                                <td className="px-4 py-3 text-right font-semibold text-[--color-danger]">-{formatCurrency(totals.deductions)}</td>
                                <td className="px-4 py-3 text-right font-bold text-lg text-[--color-accent-gold]">{formatCurrency(totals.netPay)}</td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>
        </div>
    );
}
