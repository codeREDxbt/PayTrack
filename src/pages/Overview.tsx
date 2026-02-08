import {
    Users,
    UserCheck,
    UserX,
    Clock,
    Wallet,
    TrendingUp,
    Plus,
    Calendar,
    DollarSign,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { MetricCard, Card, CardHeader, CardTitle, CardContent, Button } from '../components/ui';
import { formatCurrency } from '../utils/salaryCalculator';
import { formatDateReadable } from '../lib/utils';

// ================================
// Overview Dashboard
// Command center with KPIs
// ================================

// Mock data for demo
const mockStats = {
    totalEmployees: 52,
    activeEmployees: 48,
    presentToday: 45,
    absentToday: 3,
    onLeaveToday: 4,
    pendingPayroll: 8,
    totalMonthlyPayout: 1245000,
    totalOvertimeHours: 87,
};

const recentActivity = [
    { id: '1', action: 'Marked present', employee: 'Rahul Sharma', time: '2 mins ago' },
    { id: '2', action: 'Approved payroll', employee: 'Engineering Team', time: '1 hour ago' },
    { id: '3', action: 'Added employee', employee: 'Priya Patel', time: '3 hours ago' },
    { id: '4', action: 'Marked overtime', employee: 'Amit Kumar', time: '5 hours ago' },
    { id: '5', action: 'Generated payslip', employee: 'Sales Team', time: 'Yesterday' },
];

export function Overview() {
    const { currentMonth } = useApp();

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">
                        Dashboard
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1">
                        Overview for {formatDateReadable(new Date(currentMonth + '-01'))}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm">
                        <Calendar className="w-4 h-4" />
                        Mark Attendance
                    </Button>
                    <Button variant="primary" size="sm">
                        <Plus className="w-4 h-4" />
                        Add Employee
                    </Button>
                </div>
            </div>

            {/* KPI Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="Total Employees"
                    value={mockStats.totalEmployees}
                    icon={<Users className="w-5 h-5" />}
                    accentColor="gold"
                    trend={{ value: 4, isPositive: true }}
                />
                <MetricCard
                    label="Present Today"
                    value={mockStats.presentToday}
                    icon={<UserCheck className="w-5 h-5" />}
                    accentColor="success"
                />
                <MetricCard
                    label="On Leave"
                    value={mockStats.onLeaveToday}
                    icon={<UserX className="w-5 h-5" />}
                    accentColor="warning"
                />
                <MetricCard
                    label="Monthly Payout"
                    value={formatCurrency(mockStats.totalMonthlyPayout)}
                    icon={<Wallet className="w-5 h-5" />}
                    accentColor="blue"
                    trend={{ value: 8, isPositive: false }}
                />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                    label="Pending Payroll"
                    value={`${mockStats.pendingPayroll} employees`}
                    icon={<Clock className="w-5 h-5" />}
                    accentColor="warning"
                />
                <MetricCard
                    label="Overtime This Month"
                    value={`${mockStats.totalOvertimeHours} hrs`}
                    icon={<TrendingUp className="w-5 h-5" />}
                    accentColor="blue"
                />
                <MetricCard
                    label="Avg. Attendance"
                    value="94%"
                    icon={<UserCheck className="w-5 h-5" />}
                    accentColor="success"
                    trend={{ value: 2, isPositive: true }}
                />
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <Card className="lg:col-span-2" padding="none">
                    <CardHeader className="px-4 pt-4">
                        <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y divide-[--color-border]">
                            {recentActivity.map((activity) => (
                                <li
                                    key={activity.id}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-[--color-bg-tertiary] transition-colors"
                                >
                                    <div>
                                        <p className="text-sm text-[--color-text-primary]">
                                            <span className="font-medium">{activity.action}</span>
                                            {' — '}
                                            <span className="text-[--color-accent-gold]">{activity.employee}</span>
                                        </p>
                                    </div>
                                    <span className="text-xs text-[--color-text-muted]">{activity.time}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card padding="md">
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button variant="secondary" className="w-full justify-start">
                            <Calendar className="w-4 h-4" />
                            Bulk Attendance
                        </Button>
                        <Button variant="secondary" className="w-full justify-start">
                            <DollarSign className="w-4 h-4" />
                            Run Payroll
                        </Button>
                        <Button variant="secondary" className="w-full justify-start">
                            <Plus className="w-4 h-4" />
                            Add Employee
                        </Button>
                        <Button variant="secondary" className="w-full justify-start">
                            <TrendingUp className="w-4 h-4" />
                            View Reports
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
