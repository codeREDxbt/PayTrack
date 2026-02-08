import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Employee, AttendanceRecord, PayrollEntry, ShiftConfig, Holiday, AppSettings } from '../lib/types';
import { getDefaultShiftConfig } from '../utils/salaryCalculator';
import { useEmployees, useAttendance, usePayroll } from '../hooks/useFirestore';

// ================================
// App Context
// Global state with Firestore sync
// ================================

interface AppContextValue {
    // Employees (from Firestore)
    employees: Employee[];
    employeesLoading: boolean;
    addEmployee: (employee: Omit<Employee, 'id'>) => Promise<string>;
    updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;

    // Attendance (from Firestore)
    attendance: AttendanceRecord[];
    attendanceLoading: boolean;
    markAttendance: (record: Omit<AttendanceRecord, 'id'>) => Promise<void>;
    updateAttendance: (id: string, updates: Partial<AttendanceRecord>) => Promise<void>;

    // Payroll (from Firestore)
    payroll: PayrollEntry[];
    payrollLoading: boolean;
    createPayrollEntry: (entry: Omit<PayrollEntry, 'id' | 'generatedAt'>) => Promise<void>;
    updatePayrollEntry: (id: string, updates: Partial<PayrollEntry>) => Promise<void>;

    // Settings (local for now)
    shiftConfig: ShiftConfig;
    setShiftConfig: React.Dispatch<React.SetStateAction<ShiftConfig>>;
    holidays: Holiday[];
    setHolidays: React.Dispatch<React.SetStateAction<Holiday[]>>;
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;

    // UI State
    selectedEmployeeId: string | null;
    setSelectedEmployeeId: (id: string | null) => void;
    currentMonth: string;
    setCurrentMonth: (month: string) => void;

    // Legacy setters for compatibility
    setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
    setAttendance: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
    setPayroll: React.Dispatch<React.SetStateAction<PayrollEntry[]>>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const defaultSettings: AppSettings = {
    defaultShiftId: 'default',
    companyName: 'PayTrack',
    currency: 'INR',
    currencySymbol: '₹',
    theme: 'dark',
    reducedMotion: false,
};

export function AppProvider({ children }: { children: ReactNode }) {
    // UI State
    const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

    // Firestore hooks
    const {
        employees: firestoreEmployees,
        loading: employeesLoading,
        addEmployee,
        updateEmployee,
        deleteEmployee,
    } = useEmployees();

    const {
        attendance: firestoreAttendance,
        loading: attendanceLoading,
        markAttendance,
        updateAttendance,
    } = useAttendance(currentMonth);

    const {
        payroll: firestorePayroll,
        loading: payrollLoading,
        createPayrollEntry,
        updatePayrollEntry,
    } = usePayroll(currentMonth);

    // Local state for data (synced from Firestore)
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);

    // Settings (local for now - can be moved to Firestore later)
    const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(getDefaultShiftConfig());
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);

    // Sync Firestore data to local state
    useEffect(() => {
        setEmployees(firestoreEmployees);
    }, [firestoreEmployees]);

    useEffect(() => {
        setAttendance(firestoreAttendance);
    }, [firestoreAttendance]);

    useEffect(() => {
        setPayroll(firestorePayroll);
    }, [firestorePayroll]);

    return (
        <AppContext.Provider
            value={{
                // Employees
                employees,
                employeesLoading,
                addEmployee,
                updateEmployee,
                deleteEmployee,
                setEmployees,

                // Attendance
                attendance,
                attendanceLoading,
                markAttendance,
                updateAttendance,
                setAttendance,

                // Payroll
                payroll,
                payrollLoading,
                createPayrollEntry,
                updatePayrollEntry,
                setPayroll,

                // Settings
                shiftConfig,
                setShiftConfig,
                holidays,
                setHolidays,
                settings,
                setSettings,

                // UI State
                selectedEmployeeId,
                setSelectedEmployeeId,
                currentMonth,
                setCurrentMonth,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
}
