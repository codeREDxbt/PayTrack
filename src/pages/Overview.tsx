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
import { MetricCard, Card, CardHeader, CardTitle, CardContent, Button } from '../components/ui';
import { formatCurrency } from '../utils/salaryCalculator';
import { formatDateReadable, formatDate } from '../lib/utils';

// ================================
// Overview Dashboard
// Command center with real-time KPIs
// ================================

export function Overview() {
    const {
        employees,
        employeesLoading,
        attendance,
        payroll,
        currentMonth
    } = useApp();
    const navigate = useNavigate();

    // Calculate real stats from Firestore data
    const stats = useMemo(() => {
        const today = formatDate(new Date());
        const todayAttendance = attendance.filter(r => r.date === today);
        const monthlyPay = employees.reduce((sum, emp) =>
            emp.status === 'active' ? sum + emp.monthlyPay : sum, 0
        );

        return {
            totalEmployees: employees.length,
            activeEmployees: employees.filter(e => e.status === 'active').length,
            presentToday: todayAttendance.filter(r => r.status === 'present').length,
            absentToday: todayAttendance.filter(r => r.status === 'absent').length,
            onLeaveToday: todayAttendance.filter(r => r.status === 'leave').length,
            pendingPayroll: payroll.filter(p => p.status === 'draft').length,
            totalMonthlyPayout: monthlyPay,
        };
    }, [employees, attendance, payroll]);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">
                        Dashboard
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1">
                        Overview for {formatDateReadable(new Date(currentMonth + '-01'))}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/attendance')}>
                        <Calendar className="w-4 h-4" />
                        Mark Attendance
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => navigate('/people')}>
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
                        />
                        <MetricCard
                            label="Present Today"
                            value={stats.presentToday}
                            icon={<UserCheck className="w-5 h-5" />}
                            accentColor="success"
                        />
                        <MetricCard
                            label="On Leave"
                            value={stats.onLeaveToday}
                            icon={<UserX className="w-5 h-5" />}
                            accentColor="warning"
                        />
                        <MetricCard
                            label="Monthly Payout"
                            value={formatCurrency(stats.totalMonthlyPayout)}
                            icon={<Wallet className="w-5 h-5" />}
                            accentColor="blue"
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
                                        className="justify-center h-12"
                                        onClick={() => navigate('/attendance')}
                                    >
                                        <Calendar className="w-4 h-4" />
                                        Mark Attendance
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="justify-center h-12"
                                        onClick={() => navigate('/payroll')}
                                    >
                                        <Wallet className="w-4 h-4" />
                                        Generate Payroll
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="justify-center h-12"
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
