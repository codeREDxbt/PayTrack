import { useMemo } from 'react';
import {
    Users,
    UserCheck,
    UserX,
    Wallet,
    Plus,
    Calendar,
    Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { MetricCard, Card, CardHeader, CardTitle, CardContent, Button, Select } from '../components/ui';
import { formatCurrency } from '../utils/salaryCalculator';
import { formatDate } from '../lib/utils';

// ================================
// Overview Dashboard
// Command center with real-time KPIs
// ================================

const MONTHS = [
    { value: '2026-02', label: 'February 2026' },
    { value: '2026-01', label: 'January 2026' },
    { value: '2025-12', label: 'December 2025' },
    { value: '2025-11', label: 'November 2025' },
    { value: '2025-10', label: 'October 2025' },
];

export function Overview() {
    const {
        employees,
        employeesLoading,
        attendance,
        payroll,
        currentMonth,
        setCurrentMonth
    } = useApp();
    const navigate = useNavigate();

    // Calculate real stats from Firestore data
    const stats = useMemo(() => {
        const today = formatDate(new Date());
        // Create a Set of valid employee IDs for fast lookup
        const validEmployeeIds = new Set(employees.map(e => e.id));

        // Filter attendance/payroll to only include existing employees
        const validAttendance = attendance.filter(r => validEmployeeIds.has(r.employeeId));
        const validPayroll = payroll.filter(p => validEmployeeIds.has(p.employeeId));

        const todayAttendance = validAttendance.filter(r => r.date === today);
        const monthlyPay = employees.reduce((sum, emp) =>
            emp.status === 'active' ? sum + emp.monthlyPay : sum, 0
        );

        return {
            totalEmployees: employees.length,
            activeEmployees: employees.filter(e => e.status === 'active').length,
            presentToday: todayAttendance.filter(r => r.status === 'present').length,
            absentToday: todayAttendance.filter(r => r.status === 'absent').length,
            onLeaveToday: todayAttendance.filter(r => r.status === 'leave').length,
            pendingPayroll: validPayroll.filter(p => p.status === 'draft').length,
            totalMonthlyPayout: monthlyPay,
        };
    }, [employees, attendance, payroll]);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-light uppercase tracking-widest gold-gradient-text">
                        Dashboard
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1 text-xs uppercase tracking-widest opacity-60">
                        Overview for {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Select
                        options={MONTHS}
                        value={currentMonth}
                        onChange={(e) => setCurrentMonth(e.target.value)}
                        className="w-44"
                    />
                    <Button variant="secondary" size="sm" onClick={() => navigate('/attendance')} className="glass-gold text-primary border-primary/30">
                        <Calendar className="w-4 h-4" />
                        Mark Attendance
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => navigate('/people')} className="gold-gradient-bg text-black font-bold">
                        <Plus className="w-4 h-4" />
                        Add Employee
                    </Button>
                </div>
            </div>

            {/* Loading state */}
            {employeesLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : (
                <>
                    {/* KPI Metrics Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard
                            label="Total Employees"
                            value={stats.totalEmployees}
                            icon={<Users className="w-5 h-5" />}
                            accentColor="gold"
                            className="glass-gold border-primary/10"
                        />
                        <MetricCard
                            label="Present Today"
                            value={stats.presentToday}
                            icon={<UserCheck className="w-5 h-5" />}
                            accentColor="success"
                            className="bg-success/5 border-success/10"
                        />
                        <MetricCard
                            label="On Leave"
                            value={stats.onLeaveToday}
                            icon={<UserX className="w-5 h-5" />}
                            accentColor="warning"
                            className="bg-warning/5 border-warning/10"
                        />
                        <MetricCard
                            label="Monthly Payout"
                            value={formatCurrency(stats.totalMonthlyPayout)}
                            icon={<Wallet className="w-5 h-5" />}
                            accentColor="blue"
                            className="bg-accent-blue/5 border-accent-blue/10"
                        />
                    </div>

                    {/* Empty state if no employees */}
                    {employees.length === 0 && (
                        <Card padding="lg">
                            <div className="text-center py-8">
                                <Users className="w-12 h-12 mx-auto text-[--color-text-muted] mb-4" />
                                <h3 className="text-lg font-medium text-[--color-text-primary] mb-2">
                                    No Employees Yet
                                </h3>
                                <p className="text-[--color-text-secondary] mb-4">
                                    Get started by adding your first employee to the system.
                                </p>
                                <Button variant="primary" onClick={() => navigate('/people')}>
                                    <Plus className="w-4 h-4" />
                                    Add Your First Employee
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Quick Actions */}
                    {employees.length > 0 && (
                        <Card padding="md">
                            <CardHeader>
                                <CardTitle>Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Button
                                        variant="secondary"
                                        className="justify-center h-auto py-3"
                                        onClick={() => navigate('/attendance')}
                                    >
                                        <Calendar className="w-4 h-4" />
                                        Mark Attendance
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="justify-center h-auto py-3"
                                        onClick={() => navigate('/payroll')}
                                    >
                                        <Wallet className="w-4 h-4" />
                                        Generate Payroll
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="justify-center h-auto py-3"
                                        onClick={() => navigate('/people')}
                                    >
                                        <Users className="w-4 h-4" />
                                        Manage Employees
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
