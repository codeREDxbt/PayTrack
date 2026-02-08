import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Employee, AttendanceRecord, PayrollEntry, ShiftConfig, Holiday, AppSettings } from '../lib/types';
import { getDefaultShiftConfig } from '../utils/salaryCalculator';

// ================================
// App Context
// Global state management
// ================================

interface AppContextValue {
    // Employees
    employees: Employee[];
    setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;

    // Attendance
    attendance: AttendanceRecord[];
    setAttendance: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;

    // Payroll
    payroll: PayrollEntry[];
    setPayroll: React.Dispatch<React.SetStateAction<PayrollEntry[]>>;

    // Settings
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
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const defaultSettings: AppSettings = {
    defaultShiftId: 'default',
    companyName: 'My Company',
    currency: 'INR',
    currencySymbol: '₹',
    theme: 'dark',
    reducedMotion: false,
};

export function AppProvider({ children }: { children: ReactNode }) {
    // Core data
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);

    // Settings
    const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(getDefaultShiftConfig());
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);

    // UI State
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));

    return (
        <AppContext.Provider
            value={{
                employees,
                setEmployees,
                attendance,
                setAttendance,
                payroll,
                setPayroll,
                shiftConfig,
                setShiftConfig,
                holidays,
                setHolidays,
                settings,
                setSettings,
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
