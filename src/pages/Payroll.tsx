import { useMemo, useState } from 'react';
import {
    Calculator,
    Download,
    FileText,
    Loader2,
    AlertTriangle,
    Wallet,
    CheckCircle2,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Select, MetricCard, Modal } from '../components/ui';
import { api } from '../lib/api';
import { formatCurrency, formatDateReadable, formatMonthLabel, monthOptions, todayIso } from '../lib/format';
import { exportToCSV } from '../lib/utils';
import type { PayrollEntry, PayrollStatus, Payslip } from '../lib/types';

// ================================
// Payroll
// Staff run POST /payroll/generate (Phase 4 transaction), advance the
// DRAFT -> APPROVED -> PAID state machine and print any payslip. Employees see
// only the slips GET /payroll/me returns for them.
// ================================

const STATUS_STYLES: Record<PayrollStatus, string> = {
    DRAFT: 'bg-[--color-warning]/10 text-[--color-warning]',
    APPROVED: 'bg-[--color-accent-blue]/10 text-[--color-accent-blue]',
    PAID: 'bg-[--color-success]/10 text-[--color-success]',
};

const NEXT_STATUS: Partial<Record<PayrollStatus, PayrollStatus>> = {
    DRAFT: 'APPROVED',
    APPROVED: 'PAID',
};

export function Payroll() {
    const { user } = useAuth();
    const {
        payroll,
        loading,
        error,
        currentMonth,
        setCurrentMonth,
        generatePayroll,
        setPayrollStatus,
    } = useApp();
    const isStaff = user?.isStaff ?? false;

    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [payslip, setPayslip] = useState<Payslip | null>(null);
    const [payslipLoading, setPayslipLoading] = useState(false);

    const months = useMemo(() => monthOptions(currentMonth), [currentMonth]);
    const totals = useMemo(
        () =>
            payroll.reduce(
                (acc, entry) => ({
                    gross: acc.gross + entry.grossSalary,
                    tax: acc.tax + entry.taxDeduction,
                    net: acc.net + entry.netSalary,
                    paid: acc.paid + (entry.status === 'PAID' ? 1 : 0),
                }),
                { gross: 0, tax: 0, net: 0, paid: 0 }
            ),
        [payroll]
    );

    const handleGenerate = async () => {
        setBusy(true);
        setActionError(null);
        try {
            const result = await generatePayroll();
            alert(
                `Payroll for ${formatMonthLabel(currentMonth)}: ${result.generated} slip(s) generated, ${result.recalculated} recalculated.`
            );
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Payroll generation failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleAdvance = async (entry: PayrollEntry) => {
        const next = NEXT_STATUS[entry.status];
        if (!next) return;
        setBusy(true);
        setActionError(null);
        try {
            await setPayrollStatus(entry.payrollId, next);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not change the payroll status.');
        } finally {
            setBusy(false);
        }
    };

    const openPayslip = async (entry: PayrollEntry) => {
        setPayslipLoading(true);
        setActionError(null);
        try {
            const data = await api.payslip(entry.payrollId);
            setPayslip(data.payslip);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not load the payslip.');
        } finally {
            setPayslipLoading(false);
        }
    };

    const handleExport = () => {
        exportToCSV(
            payroll.map((entry) => ({
                Payslip: entry.payrollId,
                Employee: entry.employeeName,
                Department: entry.department,
                Period: entry.month,
                'Working days': entry.workingDays,
                Present: entry.presentDays,
                Absent: entry.absentDays,
                'Overtime hrs': entry.overtimeHours,
                Gross: entry.grossSalary,
                'Tax (TDS)': entry.taxDeduction,
                'Unpaid leave': entry.unpaidLeaveDeduction,
                'Net pay': entry.netSalary,
                Status: entry.status,
                'Payment date': entry.paymentDate ?? '',
            })),
            `Payroll_${currentMonth}`
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">
                        {isStaff ? 'Payroll' : 'My Payslips'}
                    </h1>
                    <p className="mt-1 break-words text-xs font-bold uppercase tracking-widest text-[--color-text-secondary]">
                        {formatMonthLabel(currentMonth)} &bull; computed from vw_payroll_procedural_computation
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Select
                        options={months}
                        value={currentMonth}
                        onChange={(event) => setCurrentMonth(event.target.value)}
                        className="w-44"
                    />
                    <Button variant="secondary" size="sm" onClick={handleExport} disabled={!payroll.length}>
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>
                    {isStaff && (
                        <Button variant="primary" size="sm" onClick={handleGenerate} isLoading={busy}>
                            <Calculator className="w-4 h-4" />
                            Run payroll
                        </Button>
                    )}
                </div>
            </div>

            {(error || actionError) && (
                <Card padding="md" className="border-[--color-danger] bg-[--color-danger]/5">
                    <p className="flex items-center gap-2 text-sm text-[--color-danger]">
                        <AlertTriangle className="w-4 h-4" /> {actionError ?? error}
                    </p>
                </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    label={isStaff ? 'Total net payout' : 'My net pay'}
                    value={formatCurrency(totals.net)}
                    icon={<Wallet className="w-5 h-5" />}
                    accentColor="gold"
                    className="glass-gold border-primary/10"
                />
                <MetricCard label="Gross" value={formatCurrency(totals.gross)} accentColor="blue" />
                <MetricCard label="Tax withheld" value={formatCurrency(totals.tax)} accentColor="danger" />
                <MetricCard
                    label="Paid slips"
                    value={`${totals.paid}/${payroll.length}`}
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    accentColor="success"
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : payroll.length === 0 ? (
                <Card padding="lg">
                    <div className="text-center py-8">
                        <Wallet className="w-12 h-12 mx-auto text-[--color-text-muted] mb-4" />
                        <h3 className="text-lg font-medium text-[--color-text-primary] mb-2">No payroll for this month</h3>
                        <p className="text-[--color-text-secondary]">
                            {isStaff
                                ? 'Run payroll to compute DRAFT slips for every employee with attendance in this period.'
                                : 'Your payslip will appear here once HR has run payroll.'}
                        </p>
                    </div>
                </Card>
            ) : (
                <Card padding="none">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px]">
                            <thead>
                                <tr className="border-b-2 border-[--color-border] bg-[--color-bg-secondary]">
                                    {[
                                        { label: 'Employee', align: 'left' },
                                        { label: 'Days', align: 'right' },
                                        { label: 'OT', align: 'right' },
                                        { label: 'Gross', align: 'right' },
                                        { label: 'TDS', align: 'right' },
                                        { label: 'Unpaid leave', align: 'right' },
                                        { label: 'Net', align: 'right' },
                                        { label: 'Status', align: 'left' },
                                        { label: 'Actions', align: 'right' },
                                    ].map(({ label, align }) => (
                                        <th
                                            key={label}
                                            aria-label={label === 'Actions' ? 'Actions' : undefined}
                                            className={`whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-[--color-text-muted] ${align === 'right' ? 'text-right' : 'text-left'}`}
                                        >
                                            {label === 'Actions' ? null : label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-[--color-border]">
                                {payroll.map((entry) => (
                                    <tr key={entry.payrollId} className="hover:bg-[--color-bg-tertiary] transition-colors">
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <p className="text-sm font-medium text-[--color-text-primary]">{entry.employeeName}</p>
                                            <p className="text-xs text-[--color-text-muted]">
                                                {entry.department} &bull; slip #{entry.payrollId}
                                            </p>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-[--color-text-secondary]">
                                            {entry.presentDays}
                                            {entry.halfDays > 0 && <span className="text-[--color-text-muted]"> + {entry.halfDays}½</span>}
                                            <span className="text-[--color-text-muted]"> / {entry.workingDays}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm tabular-nums text-[--color-accent-blue]">{entry.overtimeHours}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-[--color-text-secondary]">
                                            {formatCurrency(entry.grossSalary)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-[--color-danger]">
                                            {entry.taxDeduction > 0 && '-'}
                                            {formatCurrency(entry.taxDeduction)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-[--color-danger]">
                                            {entry.unpaidLeaveDeduction > 0 && '-'}
                                            {formatCurrency(entry.unpaidLeaveDeduction)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums text-[--color-accent-gold]">
                                            {formatCurrency(entry.netSalary)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[entry.status]}`}>
                                                {entry.status}
                                            </span>
                                            {entry.paymentDate && (
                                                <p className="text-[10px] text-[--color-text-muted] mt-1">
                                                    {formatDateReadable(entry.paymentDate)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                {isStaff && NEXT_STATUS[entry.status] && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleAdvance(entry)}
                                                        disabled={busy}
                                                    >
                                                        {NEXT_STATUS[entry.status] === 'APPROVED' ? 'Approve' : 'Mark paid'}
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="sm" onClick={() => void openPayslip(entry)}>
                                                    <FileText className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-[--color-bg-tertiary] border-t-2 border-[--color-border]">
                                    <td className="px-4 py-3 font-semibold text-[--color-text-primary]">
                                        Total ({payroll.length} slips)
                                    </td>
                                    <td colSpan={2} />
                                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-[--color-text-secondary]">
                                        {formatCurrency(totals.gross)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-[--color-danger]">
                                        {totals.tax > 0 && '-'}
                                        {formatCurrency(totals.tax)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-[--color-text-muted]">—</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold tabular-nums text-[--color-accent-gold]">
                                        {formatCurrency(totals.net)}
                                    </td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            <Modal
                isOpen={Boolean(payslip) || payslipLoading}
                onClose={() => setPayslip(null)}
                title={payslip ? `Payslip #${payslip.payrollId}` : 'Loading payslip'}
                size="xl"
            >
                {payslipLoading || !payslip ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-[--color-accent-gold]" />
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs uppercase tracking-widest text-[--color-text-muted]">Employee</p>
                                <p className="text-[--color-text-primary] font-medium">{payslip.employee.fullName}</p>
                                <p className="text-xs text-[--color-text-muted]">{payslip.employee.jobTitle}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-widest text-[--color-text-muted]">Period</p>
                                <p className="text-[--color-text-primary] font-medium">{payslip.periodLabel}</p>
                                <p className="text-xs text-[--color-text-muted]">
                                    {payslip.status}
                                    {payslip.paymentDate ? ` • paid ${formatDateReadable(payslip.paymentDate)}` : ''}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-sm border-y-2 border-[--color-border] py-3">
                            <div>
                                <p className="text-xs uppercase text-[--color-text-muted]">Working days</p>
                                <p className="text-[--color-text-primary]">{payslip.attendance.workingDays}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase text-[--color-text-muted]">Present</p>
                                <p className="text-[--color-text-primary]">{payslip.attendance.presentDays}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase text-[--color-text-muted]">Overtime</p>
                                <p className="text-[--color-text-primary]">{payslip.attendance.overtimeHours} h</p>
                            </div>
                        </div>

                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[--color-border]">
                                    <th className="text-left py-2 text-xs uppercase text-[--color-text-muted]">Line item</th>
                                    <th className="text-right py-2 text-xs uppercase text-[--color-text-muted]">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[--color-border]">
                                {payslip.lineItems.map((item) => (
                                    <tr key={item.sortOrder}>
                                        <td className="py-2 text-[--color-text-secondary]">
                                            <span className="text-[10px] uppercase tracking-widest text-[--color-text-muted] mr-2">
                                                {item.itemType}
                                            </span>
                                            {item.label}
                                        </td>
                                        <td className={`py-2 text-right ${item.itemType === 'DEDUCTION' ? 'text-[--color-danger]' : 'text-[--color-text-primary]'}`}>
                                            {formatCurrency(item.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex items-center justify-between border-t-2 border-[--color-border] pt-3">
                            <div className="text-xs text-[--color-text-muted]">
                                Package: base {formatCurrency(payslip.salaryPackage.baseSalary)} + HRA{' '}
                                {formatCurrency(payslip.salaryPackage.hra)} + allowances{' '}
                                {formatCurrency(payslip.salaryPackage.allowances)}
                            </div>
                            <p className="text-xl font-black text-[--color-accent-gold]">
                                {formatCurrency(payslip.netSalary)}
                            </p>
                        </div>

                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => {
                                const rows = payslip.lineItems
                                    .map((item) => `${item.itemType},${item.label},${item.amount}`)
                                    .join('\n');
                                const blob = new Blob(
                                    [`Payslip #${payslip.payrollId} — ${payslip.employee.fullName} — ${payslip.periodLabel}\nType,Item,Amount\n${rows}\nNet,${payslip.netSalary}\n`],
                                    { type: 'text/csv' }
                                );
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `payslip-${payslip.payrollId}-${todayIso()}.csv`;
                                link.click();
                                URL.revokeObjectURL(url);
                            }}
                        >
                            <Download className="w-4 h-4" /> Download payslip (CSV)
                        </Button>
                    </div>
                )}
            </Modal>
        </div>
    );
}
