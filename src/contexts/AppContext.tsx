import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { formatMonthShort, monthKey, recentMonths } from '../lib/format';
import { useAuth } from './AuthContext';
import type {
    AttendanceRecord,
    CreateAttendanceInput,
    CreateEmployeeInput,
    Dashboard,
    Employee,
    MonthlyReport,
    PayrollEntry,
    PayrollStatus,
    TrendPoint,
    UpdateAttendanceInput,
    UpdateEmployeeInput,
} from '../lib/types';

// ================================
// App Context
// Reads flow through the REST API (which reads the Phase 3 report views and
// Phase 4 secure views); writes go through the API so the Phase 2 triggers and
// Phase 4 transaction rules stay the single source of truth. Employee scope is
// enforced by the server, not by hiding rows here.
// ================================

interface AppContextValue {
    employees: Employee[];
    attendance: AttendanceRecord[];
    payroll: PayrollEntry[];
    dashboard: Dashboard | null;
    report: MonthlyReport | null;
    trend: TrendPoint[];
    loading: boolean;
    error: string | null;

    currentMonth: string;
    setCurrentMonth: (month: string) => void;

    addEmployee: (input: CreateEmployeeInput) => Promise<void>;
    updateEmployee: (id: number, input: UpdateEmployeeInput) => Promise<void>;
    deleteEmployee: (id: number) => Promise<void>;

    markAttendance: (input: CreateAttendanceInput) => Promise<void>;
    updateAttendance: (id: number, input: UpdateAttendanceInput) => Promise<void>;

    generatePayroll: () => Promise<{ generated: number; recalculated: number }>;
    setPayrollStatus: (id: number, status: PayrollStatus) => Promise<void>;

    refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

async function loadTrend(endMonth: string, staff: boolean): Promise<TrendPoint[]> {
    const months = recentMonths(endMonth, 6);
    return Promise.all(
        months.map(async (month) => {
            const data = staff ? await api.payroll(month) : await api.myPayroll(month);
            const total = data.payroll.reduce((sum, entry) => sum + entry.netSalary, 0);
            return {
                month,
                label: formatMonthShort(month),
                total: Math.round(total * 100) / 100,
            };
        })
    );
}

export function AppProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
    const [dashboard, setDashboard] = useState<Dashboard | null>(null);
    const [report, setReport] = useState<MonthlyReport | null>(null);
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The demo dataset ends 2026-10. Opening on an empty current month would
    // look broken, so the very first load steps back one month once; later
    // month choices are never overridden.
    const resolvedInitialMonth = useRef(false);

    const refresh = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const staff = user.isStaff;
            const [employeeData, attendanceData, payrollData, dashboardData, reportData, trendData] =
                await Promise.all([
                    api.employees(),
                    api.attendance(currentMonth),
                    staff ? api.payroll(currentMonth) : api.myPayroll(currentMonth),
                    api.dashboard(currentMonth),
                    staff ? api.monthlyReport(currentMonth) : Promise.resolve(null),
                    loadTrend(currentMonth, staff),
                ]);
            setEmployees(employeeData.employees);
            setAttendance(attendanceData.attendance);
            setPayroll(payrollData.payroll);
            setDashboard(dashboardData);
            setReport(reportData);
            setTrend(trendData);

            if (!resolvedInitialMonth.current) {
                resolvedInitialMonth.current = true;
                const emptyMonth =
                    dashboardData.attendance.presentDays === 0 && dashboardData.payroll.slips === 0;
                if (emptyMonth && currentMonth === monthKey()) {
                    const [year, monthNumber] = currentMonth.split('-').map(Number);
                    const previous = new Date(year, monthNumber - 2, 1);
                    setCurrentMonth(
                        `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
                    );
                }
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load PayTrack data.');
        } finally {
            setLoading(false);
        }
    }, [user, currentMonth]);

    useEffect(() => {
        if (!user) {
            setEmployees([]);
            setAttendance([]);
            setPayroll([]);
            setDashboard(null);
            setReport(null);
            setTrend([]);
            setError(null);
            return;
        }
        void refresh();
    }, [user, refresh]);

    const addEmployee = async (input: CreateEmployeeInput) => {
        await api.createEmployee(input);
        await refresh();
    };

    const updateEmployee = async (id: number, input: UpdateEmployeeInput) => {
        await api.updateEmployee(id, input);
        await refresh();
    };

    const deleteEmployee = async (id: number) => {
        await api.deleteEmployee(id);
        await refresh();
    };

    const markAttendance = async (input: CreateAttendanceInput) => {
        await api.createAttendance(input);
        await refresh();
    };

    const updateAttendance = async (id: number, input: UpdateAttendanceInput) => {
        await api.updateAttendance(id, input);
        await refresh();
    };

    const generatePayroll = async () => {
        const result = await api.generatePayroll(currentMonth);
        await refresh();
        return { generated: result.generated, recalculated: result.recalculated };
    };

    const setPayrollStatus = async (id: number, status: PayrollStatus) => {
        await api.setPayrollStatus(id, status);
        await refresh();
    };

    return (
        <AppContext.Provider
            value={{
                employees,
                attendance,
                payroll,
                dashboard,
                report,
                trend,
                loading,
                error,
                currentMonth,
                setCurrentMonth,
                addEmployee,
                updateEmployee,
                deleteEmployee,
                markAttendance,
                updateAttendance,
                generatePayroll,
                setPayrollStatus,
                refresh,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useApp(): AppContextValue {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within an AppProvider');
    return context;
}
