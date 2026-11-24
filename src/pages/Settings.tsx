import { useState } from 'react';
import { Save, Download, Sun, Moon, Monitor, AlertTriangle, Server } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import { API_BASE_URL } from '../lib/api';
import { todayIso } from '../lib/format';
import { exportToCSV } from '../lib/utils';

// ================================
// Settings
// Appearance and a client-side export of what the API returned. There is no
// local mutation of payroll or attendance here: all writes belong to the
// Phase 4 transaction rules, so this page does not offer an "import" that
// could bypass them.
// ================================

export function Settings() {
    const { theme, setTheme } = useTheme();
    const { user } = useAuth();
    const { employees, attendance, payroll, currentMonth } = useApp();
    const [savedAt, setSavedAt] = useState<string | null>(null);

    const handleExportEmployees = () => {
        exportToCSV(
            employees.map((employee) => ({
                'Employee ID': employee.employeeId,
                Name: employee.fullName,
                Email: employee.email,
                Phone: employee.phone ?? '',
                Role: employee.jobTitle,
                Department: employee.department,
                'System Role': employee.systemRole,
                Joined: employee.joinDate,
                Status: employee.status,
            })),
            `PayTrack_Employees_${todayIso()}`
        );
    };

    const handleExportAttendance = () => {
        exportToCSV(
            attendance.map((record) => ({
                Date: record.date,
                Employee: record.employeeName ?? record.employeeId,
                Status: record.status,
                In: record.checkInTime ?? '',
                Out: record.checkOutTime ?? '',
                Hours: record.hoursWorked,
                Overtime: record.overtimeHours,
                Late: record.isLate ? 'yes' : 'no',
                'Late minutes': record.lateMinutes,
            })),
            `PayTrack_Attendance_${currentMonth}`
        );
    };

    const handleExportPayroll = () => {
        exportToCSV(
            payroll.map((entry) => ({
                Payslip: entry.payrollId,
                Employee: entry.employeeName,
                Period: entry.month,
                Gross: entry.grossSalary,
                TDS: entry.taxDeduction,
                'Unpaid leave': entry.unpaidLeaveDeduction,
                Net: entry.netSalary,
                Status: entry.status,
                Paid: entry.paymentDate ?? '',
            })),
            `PayTrack_Payroll_${currentMonth}`
        );
    };

    const handleSave = () => {
        setSavedAt(new Date().toLocaleTimeString());
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">Settings</h1>
                    <p className="text-[--color-text-secondary] mt-1 text-xs font-bold uppercase tracking-widest">
                        Appearance, exports and connection details
                    </p>
                </div>
                <Button variant="primary" size="sm" onClick={handleSave}>
                    <Save className="w-4 h-4" /> Save
                </Button>
            </div>

            {savedAt && (
                <p className="text-xs text-[--color-success] uppercase tracking-widest">Preferences saved at {savedAt}</p>
            )}

            <Card padding="md">
                <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3 flex-wrap">
                        {[
                            { value: 'dark', label: 'Dark', icon: Moon },
                            { value: 'light', label: 'Light', icon: Sun },
                            { value: 'system', label: 'System', icon: Monitor },
                        ].map((option) => {
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.value}
                                    onClick={() => setTheme(option.value as typeof theme)}
                                    className={`flex items-center gap-2 px-4 py-2.5 border rounded-[--radius-md] transition-all ${
                                        theme === option.value
                                            ? 'border-[--color-accent-gold] bg-[--color-accent-gold]/10 text-[--color-accent-gold]'
                                            : 'border-[--color-border] text-[--color-text-secondary] hover:bg-[--color-bg-tertiary]'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span className="text-sm font-medium">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card padding="md">
                <CardHeader>
                    <CardTitle>Connection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                        <Server className="w-4 h-4 text-[--color-text-muted] mt-0.5" />
                        <div>
                            <p className="text-[--color-text-primary] font-mono break-all">{API_BASE_URL}</p>
                            <p className="text-xs text-[--color-text-muted] mt-1">
                                Set <code>VITE_API_URL</code> to point the UI at another API host. The server reads
                                SQLite, enforces roles, and never sends credentials to the browser.
                            </p>
                        </div>
                    </div>
                    <p className="text-xs text-[--color-text-muted]">
                        Signed in as {user?.email} ({user?.systemRole}). Session tokens are stored hashed in the
                        Session table and expire after 12 hours.
                    </p>
                </CardContent>
            </Card>

            <Card padding="md">
                <CardHeader>
                    <CardTitle>Data export</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-[--color-text-secondary]">
                        Exports contain exactly the rows the API returned for your role. Payroll and attendance are
                        written only through the API, so there is no import that could bypass the Phase 4 triggers.
                    </p>
                    <div className="flex gap-3 flex-wrap">
                        <Button variant="secondary" onClick={handleExportEmployees}>
                            <Download className="w-4 h-4" /> Employees
                        </Button>
                        <Button variant="secondary" onClick={handleExportAttendance}>
                            <Download className="w-4 h-4" /> Attendance ({currentMonth})
                        </Button>
                        <Button variant="secondary" onClick={handleExportPayroll}>
                            <Download className="w-4 h-4" /> Payroll ({currentMonth})
                        </Button>
                    </div>
                    <div className="p-4 bg-[--color-warning]/10 border border-[--color-warning]/30 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-[--color-warning] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[--color-warning]">
                            Salary revisions and payroll recalculation happen in the database under Phase 4 transaction
                            rules; the UI intentionally offers no shortcut around them.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card padding="md">
                <CardContent>
                    <h3 className="font-medium text-[--color-text-primary]">PayTrack</h3>
                    <p className="text-sm text-[--color-text-muted]">
                        DBMS capstone &bull; React + TypeScript client, SQLite + Node API
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
