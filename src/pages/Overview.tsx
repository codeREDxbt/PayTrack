import { useMemo } from 'react';
import {
    Users,
    UserCheck,
    Wallet,
    Calendar,
    Plus,
    BarChart3,
    Clock,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { MetricCard, Card, CardHeader, CardTitle, CardContent, Button, Select } from '../components/ui';
import { PayrollTrendChart } from '../components/PayrollTrendChart';
import { formatCurrency, formatMonthLabel, monthOptions } from '../lib/format';

// ================================
// Overview Dashboard
// KPIs come from GET /me/dashboard (org-wide for staff, self-scoped for an
// employee) and the trend is built from monthly payroll reads.
// ================================

export function Overview() {
    const { user } = useAuth();
    const { dashboard, trend, loading, error, currentMonth, setCurrentMonth } = useApp();
    const navigate = useNavigate();

    const months = useMemo(() => monthOptions(currentMonth), [currentMonth]);
    const attendance = dashboard?.attendance;
    const payroll = dashboard?.payroll;
    const isStaff = user?.isStaff ?? false;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">
                        {isStaff ? 'Dashboard' : 'My Overview'}
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1 text-xs font-bold uppercase tracking-widest">
                        {isStaff ? 'Organisation' : 'Personal'} figures for {formatMonthLabel(currentMonth)}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Select
                        options={months}
                        value={currentMonth}
                        onChange={(event) => setCurrentMonth(event.target.value)}
                        className="w-40 sm:w-44"
                    />
                    <Button variant="secondary" size="sm" onClick={() => navigate('/attendance')}>
                        <Calendar className="w-4 h-4" />
                        <span className="hidden sm:inline">{isStaff ? 'Attendance' : 'My attendance'}</span>
                    </Button>
                    {isStaff && (
                        <Button variant="primary" size="sm" onClick={() => navigate('/people')}>
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Add employee</span>
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <Card padding="md" className="border-[--color-danger] bg-[--color-danger]/5">
                    <p className="flex items-center gap-2 text-sm text-[--color-danger]">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </p>
                </Card>
            )}

            {loading && !dashboard ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard
                            label={isStaff ? 'Headcount' : 'Employee'}
                            value={dashboard?.headcount ?? 0}
                            icon={<Users className="w-5 h-5" />}
                            accentColor="gold"
                            className="glass-gold border-primary/10"
                        />
                        <MetricCard
                            label="Present days"
                            value={attendance?.presentDays ?? 0}
                            icon={<UserCheck className="w-5 h-5" />}
                            accentColor="success"
                            className="bg-success/5 border-success/10"
                        />
                        <MetricCard
                            label="Late marks"
                            value={attendance?.lateMarks ?? 0}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            accentColor="warning"
                            className="bg-warning/5 border-warning/10"
                        />
                        <MetricCard
                            label={isStaff ? 'Net paid' : 'My net paid'}
                            value={formatCurrency(payroll?.paidNetSalary ?? 0)}
                            icon={<Wallet className="w-5 h-5" />}
                            accentColor="blue"
                            className="bg-accent-blue/5 border-accent-blue/10"
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard label="Absent days" value={attendance?.absentDays ?? 0} accentColor="danger" />
                        <MetricCard label="Leave days" value={attendance?.leaveDays ?? 0} accentColor="warning" />
                        <MetricCard label="Half days" value={attendance?.halfDays ?? 0} accentColor="gold" />
                        <MetricCard
                            label="Overtime hours"
                            value={attendance?.overtimeHours ?? 0}
                            icon={<Clock className="w-5 h-5" />}
                            accentColor="blue"
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <PayrollTrendChart data={trend} currentMonth={currentMonth} scope={dashboard?.scope ?? 'SELF'} />
                        </div>
                        <div className="lg:col-span-1">
                            <Card padding="md" className="h-full">
                                <CardHeader>
                                    <CardTitle>Quick actions</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-col gap-3">
                                        {isStaff ? (
                                            <>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/attendance')}
                                                >
                                                    <Calendar className="w-4 h-4" />
                                                    Mark attendance
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/payroll')}
                                                >
                                                    <Wallet className="w-4 h-4" />
                                                    Generate payroll
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/reports')}
                                                >
                                                    <BarChart3 className="w-4 h-4" />
                                                    Monthly reports
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/people')}
                                                >
                                                    <Users className="w-4 h-4" />
                                                    Manage employees
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/attendance')}
                                                >
                                                    <Calendar className="w-4 h-4" />
                                                    View my attendance
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/payroll')}
                                                >
                                                    <Wallet className="w-4 h-4" />
                                                    View my payslips
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="justify-start h-auto py-3 border-2 border-[--color-border]"
                                                    onClick={() => navigate('/profile')}
                                                >
                                                    <Users className="w-4 h-4" />
                                                    My profile
                                                </Button>
                                            </>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-4 border-t-2 border-[--color-border] text-xs text-[--color-text-muted] space-y-1">
                                        <p>Sessions: {payroll?.slips ?? 0} payslip(s) this month</p>
                                        <p>Paid: {payroll?.paidSlips ?? 0}</p>
                                        <p>
                                            {dashboard?.scope === 'ORG'
                                                ? `Departments: ${dashboard.departments ?? 0}`
                                                : `Signed in as ${user?.systemRole}`}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
