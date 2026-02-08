import { useMemo, useState } from 'react';
import {
    Calculator,
    Download,
    FileText,
    Check,
    Clock,
    Loader2,
    Users,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button, Card, Select, MetricCard, Modal } from '../components/ui';
import { formatCurrency } from '../utils/salaryCalculator';
import type { Employee } from '../lib/types';

// ================================
// Payroll Page
// Real salary calculation from attendance
// ================================

const MONTHS = [
    { value: '2026-02', label: 'February 2026' },
    { value: '2026-01', label: 'January 2026' },
    { value: '2025-12', label: 'December 2025' },
];

export function Payroll() {
    const {
        employees,
        employeesLoading,
        attendance,
        payroll,
        createPayrollEntry,
        shiftConfig,
        currentMonth
    } = useApp();
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [generating, setGenerating] = useState(false);
    const [payslipEmployee, setPayslipEmployee] = useState<Employee | null>(null);

    // Calculate payroll from actual attendance data
    const calculatedPayroll = useMemo(() => {
        return employees.map((emp) => {
            // Get attendance for this employee for selected month
            const empAttendance = attendance.filter(
                (a) => a.employeeId === emp.id && a.date.startsWith(selectedMonth)
            );

            const presentDays = empAttendance.filter(a => a.status === 'present').length;
            const halfDays = empAttendance.filter(a => a.status === 'half-day').length;
            const absentDays = empAttendance.filter(a => a.status === 'absent').length;
            const leaveDays = empAttendance.filter(a => a.status === 'leave').length;
            const overtimeHours = empAttendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);

            // Calculate pay
            const hourlyRate = emp.monthlyPay / (shiftConfig.workingDaysPerMonth * shiftConfig.hoursPerDay);
            const effectiveDays = presentDays + (halfDays * 0.5);
            const basePay = effectiveDays * shiftConfig.hoursPerDay * hourlyRate;
            const overtimePay = overtimeHours * hourlyRate * shiftConfig.overtimeMultiplier;

            // Deductions for absent days (if any attendance was marked)
            const totalMarkedDays = presentDays + halfDays + absentDays + leaveDays;
            const deductions = totalMarkedDays > 0 ? absentDays * (emp.monthlyPay / shiftConfig.workingDaysPerMonth) : 0;

            // Check if payroll entry exists
            const existingEntry = payroll.find(
                (p) => p.employeeId === emp.id && p.month === selectedMonth
            );

            return {
                employee: emp,
                daysWorked: presentDays,
                halfDays,
                absentDays,
                leaveDays,
                overtimeHours,
                basePay: Math.round(basePay),
                overtimePay: Math.round(overtimePay),
                deductions: Math.round(deductions),
                netPay: Math.max(0, Math.round(basePay + overtimePay - deductions)),
                status: existingEntry?.status || 'draft',
                existingEntry,
            };
        });
    }, [employees, attendance, payroll, selectedMonth, shiftConfig]);

    // Filter by department
    const filteredPayroll = useMemo(() => {
        if (!selectedDepartment) return calculatedPayroll;
        return calculatedPayroll.filter(
            (entry) => entry.employee.department.toLowerCase() === selectedDepartment.toLowerCase()
        );
    }, [calculatedPayroll, selectedDepartment]);

    // Calculate totals
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

    // Generate payroll entries in Firestore
    const handleGeneratePayroll = async () => {
        if (employees.length === 0) {
            alert('No employees found. Add employees first.');
            return;
        }

        setGenerating(true);
        try {
            for (const calc of calculatedPayroll) {
                if (!calc.existingEntry) {
                    await createPayrollEntry({
                        employeeId: calc.employee.id,
                        month: selectedMonth,
                        daysWorked: calc.daysWorked,
                        halfDays: calc.halfDays,
                        overtimeHours: calc.overtimeHours,
                        deductions: calc.deductions,
                        basePay: calc.basePay,
                        overtimePay: calc.overtimePay,
                        netPay: calc.netPay,
                        status: 'draft',
                    });
                }
            }
            alert('Payroll generated successfully!');
        } catch (error) {
            console.error('Error generating payroll:', error);
            alert('Failed to generate payroll. Please try again.');
        } finally {
            setGenerating(false);
        }
    };

    // Export payroll as XLS (HTML Table)
    const handleExport = () => {
        // Create an HTML table for XLS export
        const tableContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <!--[if gte mso 9]>
                <xml>
                    <x:ExcelWorkbook>
                        <x:ExcelWorksheets>
                            <x:ExcelWorksheet>
                                <x:Name>Payroll ${selectedMonth}</x:Name>
                                <x:WorksheetOptions>
                                    <x:DisplayGridlines/>
                                </x:WorksheetOptions>
                            </x:ExcelWorksheet>
                        </x:ExcelWorksheets>
                    </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <style>
                    th { font-weight: bold; background-color: #f0f0f0; border: 1px solid #ccc; }
                    td { border: 1px solid #ccc; }
                </style>
            </head>
            <body>
                <table>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Department</th>
                            <th>Role</th>
                            <th>Days Worked</th>
                            <th>Half Days</th>
                            <th>Overtime Hrs</th>
                            <th>Base Pay</th>
                            <th>Overtime Pay</th>
                            <th>Deductions</th>
                            <th>Net Pay</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredPayroll.map(entry => `
                            <tr>
                                <td>${entry.employee.name}</td>
                                <td>${entry.employee.department}</td>
                                <td>${entry.employee.role}</td>
                                <td>${entry.daysWorked}</td>
                                <td>${entry.halfDays}</td>
                                <td>${entry.overtimeHours}</td>
                                <td>${entry.basePay}</td>
                                <td>${entry.overtimePay}</td>
                                <td>${entry.deductions}</td>
                                <td>${entry.netPay}</td>
                                <td>${entry.status}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll-${selectedMonth}.xls`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Generate payslip
    const generatePayslip = (employee: Employee) => {
        setPayslipEmployee(employee);
    };

    const payslipData = payslipEmployee
        ? calculatedPayroll.find((c) => c.employee.id === payslipEmployee.id)
        : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">Payroll</h1>
                    <p className="text-[--color-text-secondary] mt-1">Calculate and manage employee salaries</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={handleExport}>
                        <Download className="w-4 h-4" />
                        Export XLS
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleGeneratePayroll} disabled={generating}>
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                        Run Payroll
                    </Button>
                </div>
            </div>

            {employeesLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : employees.length === 0 ? (
                <Card padding="lg">
                    <div className="text-center py-8">
                        <Users className="w-12 h-12 mx-auto text-[--color-text-muted] mb-4" />
                        <h3 className="text-lg font-medium text-[--color-text-primary] mb-2">No Employees</h3>
                        <p className="text-[--color-text-secondary]">
                            Add employees in the People page to generate payroll.
                        </p>
                    </div>
                </Card>
            ) : (
                <>
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
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card padding="md">
                        <div className="flex items-center gap-4">
                            <Select
                                label="Month"
                                options={MONTHS}
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-48"
                            />
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
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Days</th>
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">OT Hrs</th>
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Base Pay</th>
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">OT Pay</th>
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Deductions</th>
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Net Pay</th>
                                        <th className="text-center text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Status</th>
                                        <th className="text-right text-xs font-medium text-[--color-text-muted] uppercase px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[--color-border]">
                                    {filteredPayroll.map((entry) => (
                                        <tr key={entry.employee.id} className="hover:bg-[--color-bg-tertiary] transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center text-[--color-accent-gold] text-sm font-medium">
                                                        {entry.employee.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-[--color-text-primary]">{entry.employee.name}</p>
                                                        <p className="text-xs text-[--color-text-muted]">{formatCurrency(entry.employee.monthlyPay)}/month</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-[--color-text-secondary]">
                                                {entry.daysWorked}{entry.halfDays > 0 && <span className="text-[--color-text-muted]"> + {entry.halfDays}½</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-[--color-accent-blue]">{entry.overtimeHours}</td>
                                            <td className="px-4 py-3 text-right text-sm text-[--color-text-secondary]">{formatCurrency(entry.basePay)}</td>
                                            <td className="px-4 py-3 text-right text-sm text-[--color-success]">+{formatCurrency(entry.overtimePay)}</td>
                                            <td className="px-4 py-3 text-right text-sm text-[--color-danger]">-{formatCurrency(entry.deductions)}</td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold text-[--color-accent-gold]">{formatCurrency(entry.netPay)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${entry.status === 'approved'
                                                    ? 'bg-[--color-success]/10 text-[--color-success]'
                                                    : 'bg-[--color-warning]/10 text-[--color-warning]'
                                                    }`}>
                                                    {entry.status === 'approved' ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                    {entry.status === 'approved' ? 'Approved' : 'Pending'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button variant="ghost" size="sm" onClick={() => generatePayslip(entry.employee)}>
                                                    <FileText className="w-4 h-4" />
                                                    Payslip
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
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
                </>
            )}

            {/* Payslip Modal */}
            <Modal
                isOpen={!!payslipEmployee}
                onClose={() => setPayslipEmployee(null)}
                title={`Payslip - ${payslipEmployee?.name || ''}`}
                size="lg"
            >
                {payslipEmployee && payslipData && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-[--color-text-muted]">Employee</p>
                                <p className="font-medium text-[--color-text-primary]">{payslipEmployee.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-[--color-text-muted]">Department</p>
                                <p className="font-medium text-[--color-text-primary]">{payslipEmployee.department}</p>
                            </div>
                            <div>
                                <p className="text-sm text-[--color-text-muted]">Role</p>
                                <p className="font-medium text-[--color-text-primary]">{payslipEmployee.role}</p>
                            </div>
                            <div>
                                <p className="text-sm text-[--color-text-muted]">Period</p>
                                <p className="font-medium text-[--color-text-primary]">{selectedMonth}</p>
                            </div>
                        </div>

                        <div className="border-t border-[--color-border] pt-4">
                            <h4 className="font-medium text-[--color-text-primary] mb-3">Earnings</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-[--color-text-secondary]">Base Pay ({payslipData.daysWorked} days)</span>
                                    <span className="text-[--color-text-primary]">{formatCurrency(payslipData.basePay)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[--color-text-secondary]">Overtime Pay ({payslipData.overtimeHours} hrs)</span>
                                    <span className="text-[--color-success]">+{formatCurrency(payslipData.overtimePay)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-[--color-border] pt-4">
                            <h4 className="font-medium text-[--color-text-primary] mb-3">Deductions</h4>
                            <div className="flex justify-between">
                                <span className="text-[--color-text-secondary]">Absence Deduction ({payslipData.absentDays} days)</span>
                                <span className="text-[--color-danger]">-{formatCurrency(payslipData.deductions)}</span>
                            </div>
                        </div>

                        <div className="border-t border-[--color-border] pt-4">
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-semibold text-[--color-text-primary]">Net Pay</span>
                                <span className="text-xl font-bold text-[--color-accent-gold]">{formatCurrency(payslipData.netPay)}</span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button variant="secondary" onClick={() => setPayslipEmployee(null)}>
                                Close
                            </Button>
                            <Button variant="primary" onClick={() => window.print()}>
                                <Download className="w-4 h-4" />
                                Print Payslip
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
