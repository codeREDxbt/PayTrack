import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, AlertTriangle, Download, Clock, Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { api } from '../lib/api';
import { Button, Card, Select, MetricCard } from '../components/ui';
import { formatCurrency, formatMonthLabel, monthOptions } from '../lib/format';
import { exportToCSV } from '../lib/utils';
import type { AttendanceSummaryRow, LateMark, MonthlyReport } from '../lib/types';

// ================================
// Reports (staff only)
// Three Phase 3 artefacts in one screen: the department rollup
// (vw_rpt_department_rollup), the per-employee monthly summary
// (vw_employee_attendance_monthly_summary) and late marks (vw_rpt_late_marks).
// ================================

export function Reports() {
    const { currentMonth, setCurrentMonth } = useApp();
    const [report, setReport] = useState<MonthlyReport | null>(null);
    const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
    const [lateMarks, setLateMarks] = useState<LateMark[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const months = useMemo(() => monthOptions(currentMonth), [currentMonth]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([
            api.monthlyReport(currentMonth),
            api.attendanceSummary(currentMonth),
            api.lateMarks(currentMonth),
        ])
            .then(([reportData, summaryData, lateData]) => {
                if (cancelled) return;
                setReport(reportData);
                setSummary(summaryData.attendance);
                setLateMarks(lateData.lateMarks);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'Could not load the monthly reports.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [currentMonth]);

    const handleExport = () => {
        if (!report) return;
        exportToCSV(
            report.departments.map((row) => ({
                Department: row.department,
                Month: row.month_key,
                Employees: row.employees_logged,
                Present: row.present_days,
                Leave: row.leave_days,
                Absent: row.absent_days,
                'Late marks': row.late_marks,
                'Overtime hours': row.overtime_hours,
                'Paid slips': row.paid_slips,
                'Paid gross': row.paid_gross_salary,
                'Paid TDS': row.paid_tax_deduction,
                'Paid net': row.paid_net_salary,
            })),
            `Department_Rollup_${currentMonth}`
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">
                        Reports
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1 text-xs font-bold uppercase tracking-widest">
                        {formatMonthLabel(currentMonth)} &bull; Phase 3 report views
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select
                        options={months}
                        value={currentMonth}
                        onChange={(event) => setCurrentMonth(event.target.value)}
                        className="w-44"
                    />
                    <Button variant="secondary" size="sm" onClick={handleExport} disabled={!report?.departments.length}>
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>
                </div>
            </div>

            {error && (
                <Card padding="md" className="border-[--color-danger] bg-[--color-danger]/5">
                    <p className="flex items-center gap-2 text-sm text-[--color-danger]">
                        <AlertTriangle className="w-4 h-4" /> {error}
                    </p>
                </Card>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : report ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard
                            label="Present days"
                            value={report.totals.presentDays}
                            icon={<Users className="w-5 h-5" />}
                            accentColor="success"
                        />
                        <MetricCard
                            label="Late marks"
                            value={report.totals.lateMarks}
                            icon={<Clock className="w-5 h-5" />}
                            accentColor="warning"
                        />
                        <MetricCard
                            label="Net payroll"
                            value={formatCurrency(report.totals.payroll.netSalary)}
                            icon={<BarChart3 className="w-5 h-5" />}
                            accentColor="gold"
                            className="glass-gold border-primary/10"
                        />
                        <MetricCard
                            label="Slips paid"
                            value={`${report.totals.payroll.paid}/${report.totals.payroll.slips}`}
                            accentColor="blue"
                        />
                    </div>

                    <Card padding="none">
                        <div className="p-4 flex items-center justify-between">
                            <h2 className="text-sm font-black uppercase tracking-widest text-[--color-text-primary]">
                                Department rollup
                            </h2>
                            <span className="text-xs text-[--color-text-muted]">vw_rpt_department_rollup</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[820px]">
                                <thead>
                                    <tr className="border-y-2 border-[--color-border] bg-[--color-bg-secondary]">
                                        {['Department', 'Staff', 'Present', 'Leave', 'Absent', 'Late', 'OT hrs', 'Paid slips', 'Paid net'].map((heading, index) => (
                                            <th
                                                key={heading}
                                                className={`whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-[--color-text-muted] ${index === 0 ? 'text-left' : 'text-right'}`}
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[--color-border]">
                                    {report.departments.map((row) => (
                                        <tr key={row.department} className="hover:bg-[--color-bg-tertiary]">
                                            <td className="whitespace-nowrap px-3 py-2 text-sm text-[--color-text-primary]">{row.department}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.employees_logged}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.present_days}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.leave_days}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.absent_days}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-warning]">{row.late_marks}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.overtime_hours}</td>
                                            <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">
                                                {row.paid_slips}/{row.payroll_slips}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-medium tabular-nums text-[--color-accent-gold]">
                                                {formatCurrency(row.paid_net_salary)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-[--color-bg-tertiary] border-t-2 border-[--color-border]">
                                        <td className="px-3 py-2 text-sm font-bold text-[--color-text-primary]">Total</td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">
                                            {report.departments.reduce((sum, row) => sum + row.employees_logged, 0)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{report.totals.presentDays}</td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{report.totals.leaveDays}</td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{report.totals.absentDays}</td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-warning]">{report.totals.lateMarks}</td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{report.totals.overtimeHours}</td>
                                        <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">
                                            {report.totals.payroll.paid}/{report.totals.payroll.slips}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-bold tabular-nums text-[--color-accent-gold]">
                                            {formatCurrency(report.totals.payroll.netSalary)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 gap-6">
                        <Card padding="none">
                            <div className="p-4 flex items-center justify-between">
                                <h2 className="text-sm font-black uppercase tracking-widest text-[--color-text-primary]">
                                    Attendance summary
                                </h2>
                                <span className="text-xs text-[--color-text-muted]">per employee</span>
                            </div>
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full min-w-[680px]">
                                    <thead className="sticky top-0 bg-[--color-bg-secondary]">
                                        <tr className="border-y-2 border-[--color-border]">
                                            {['Employee', 'Present', 'Leave', 'Absent', 'Late', 'OT'].map((heading, index) => (
                                                <th
                                                    key={heading}
                                                    className={`whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-[--color-text-muted] ${index === 0 ? 'text-left' : 'text-right'}`}
                                                >
                                                    {heading}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[--color-border]">
                                        {summary.map((row) => (
                                            <tr key={row.employee_id}>
                                                <td className="px-3 py-2 text-sm text-[--color-text-primary]">
                                                    {row.employee_name}
                                                    <span className="block text-[10px] uppercase text-[--color-text-muted]">
                                                        {row.department}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.present_days}</td>
                                                <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.leave_days}</td>
                                                <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.absent_days}</td>
                                                <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-warning]">{row.total_late_marks}</td>
                                                <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-text-secondary]">{row.total_overtime_hours}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {summary.length === 0 && (
                                    <p className="text-center py-8 text-[--color-text-muted]">No attendance in this month.</p>
                                )}
                            </div>
                        </Card>

                        <Card padding="none">
                            <div className="p-4 flex items-center justify-between">
                                <h2 className="text-sm font-black uppercase tracking-widest text-[--color-text-primary]">
                                    Late marks
                                </h2>
                                <span className="text-xs text-[--color-text-muted]">vw_rpt_late_marks</span>
                            </div>
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full min-w-[680px]">
                                    <thead className="sticky top-0 bg-[--color-bg-secondary]">
                                        <tr className="border-y-2 border-[--color-border]">
                                            {['Date', 'Employee', 'Check-in', 'Minutes'].map((heading, index) => (
                                                <th
                                                    key={heading}
                                                    className={`whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-[--color-text-muted] ${index === 3 ? 'text-right' : 'text-left'}`}
                                                >
                                                    {heading}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[--color-border]">
                                        {lateMarks.map((row) => (
                                            <tr key={row.attendance_id}>
                                                <td className="px-3 py-2 text-sm text-[--color-text-secondary]">
                                                    {row.attendance_date}
                                                    <span className="block text-[10px] uppercase text-[--color-text-muted]">
                                                        {row.day_of_week_name}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-sm text-[--color-text-primary]">
                                                    {row.employee_name}
                                                    <span className="block text-[10px] uppercase text-[--color-text-muted]">
                                                        {row.department}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-[--color-text-secondary]">{row.check_in_time}</td>
                                                <td className="px-3 py-2 text-right text-sm tabular-nums text-[--color-warning]">{row.late_minutes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {lateMarks.length === 0 && (
                                    <p className="text-center py-8 text-[--color-text-muted]">No late punches this month.</p>
                                )}
                            </div>
                        </Card>
                    </div>
                </>
            ) : null}
        </div>
    );
}
