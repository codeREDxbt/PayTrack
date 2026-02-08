import { useState, useMemo } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Check,
    X,
    Coffee,
    Calendar as CalendarIcon,
    Clock,
    Users,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button, Card, Select, MetricCard } from '../components/ui';
import type { AttendanceRecord } from '../lib/types';
import { getDaysInMonth, formatDate, generateId } from '../lib/utils';

// ================================
// Time & Leave Page
// Attendance calendar and leave management
// ================================

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Mock employees for demo
const mockEmployees = [
    { id: '1', name: 'Rahul Sharma' },
    { id: '2', name: 'Priya Patel' },
    { id: '3', name: 'Amit Kumar' },
    { id: '4', name: 'Sunita Gupta' },
    { id: '5', name: 'Vikram Singh' },
];

type AttendanceStatus = 'present' | 'absent' | 'leave' | 'holiday' | 'half-day';

const statusColors: Record<AttendanceStatus, string> = {
    present: 'bg-[--color-success] text-white',
    absent: 'bg-[--color-danger] text-white',
    leave: 'bg-[--color-warning] text-[--color-text-inverse]',
    holiday: 'bg-[--color-accent-blue] text-white',
    'half-day': 'bg-[--color-accent-gold] text-[--color-text-inverse]',
};

const statusIcons: Record<AttendanceStatus, React.ReactNode> = {
    present: <Check className="w-4 h-4" />,
    absent: <X className="w-4 h-4" />,
    leave: <Coffee className="w-4 h-4" />,
    holiday: <CalendarIcon className="w-4 h-4" />,
    'half-day': <Clock className="w-4 h-4" />,
};

export function TimeLeave() {
    const { attendance, setAttendance, currentMonth, setCurrentMonth } = useApp();
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('present');

    // Parse current month
    const [year, month] = currentMonth.split('-').map(Number);
    const daysInMonth = getDaysInMonth(year, month - 1);
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const days = [];

        // Empty cells for days before the first day
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push({ day: null, date: '' });
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            days.push({ day, date });
        }

        return days;
    }, [year, month, daysInMonth, firstDayOfMonth]);

    // Get attendance for a specific day
    const getAttendanceForDay = (date: string, employeeId: string): AttendanceRecord | undefined => {
        return attendance.find(
            (record) => record.date === date && record.employeeId === employeeId
        );
    };

    // Count attendance for stats
    const stats = useMemo(() => {
        const monthAttendance = attendance.filter(
            (record) => record.date.startsWith(currentMonth)
        );

        return {
            present: monthAttendance.filter((r) => r.status === 'present').length,
            absent: monthAttendance.filter((r) => r.status === 'absent').length,
            leave: monthAttendance.filter((r) => r.status === 'leave').length,
            halfDay: monthAttendance.filter((r) => r.status === 'half-day').length,
            overtime: monthAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0),
        };
    }, [attendance, currentMonth]);

    // Navigate months
    const handlePrevMonth = () => {
        const date = new Date(year, month - 2, 1);
        setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        const date = new Date(year, month, 1);
        setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };

    // Toggle attendance for a day
    const handleDayClick = (date: string) => {
        if (!date || selectedEmployeeId === 'all') return;

        const existingRecord = getAttendanceForDay(date, selectedEmployeeId);

        if (existingRecord) {
            // Update existing record
            setAttendance((prev) =>
                prev.map((record) =>
                    record.id === existingRecord.id
                        ? { ...record, status: selectedStatus, updatedAt: new Date().toISOString() }
                        : record
                )
            );
        } else {
            // Create new record
            const newRecord: AttendanceRecord = {
                id: generateId(),
                employeeId: selectedEmployeeId,
                date,
                status: selectedStatus,
                overtimeHours: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            setAttendance((prev) => [...prev, newRecord]);
        }
    };

    // Bulk mark all present
    const handleBulkMarkPresent = () => {
        const today = formatDate(new Date());
        const newRecords: AttendanceRecord[] = mockEmployees
            .filter((emp) => !getAttendanceForDay(today, emp.id))
            .map((emp) => ({
                id: generateId(),
                employeeId: emp.id,
                date: today,
                status: 'present' as const,
                overtimeHours: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }));

        setAttendance((prev) => [...prev, ...newRecords]);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">
                        Time & Leave
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1">
                        Track attendance, overtime, and leave
                    </p>
                </div>
                <Button variant="primary" size="sm" onClick={handleBulkMarkPresent}>
                    <Users className="w-4 h-4" />
                    Mark All Present Today
                </Button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricCard
                    label="Present Days"
                    value={stats.present}
                    accentColor="success"
                />
                <MetricCard
                    label="Absent Days"
                    value={stats.absent}
                    accentColor="danger"
                />
                <MetricCard
                    label="Leave Days"
                    value={stats.leave}
                    accentColor="warning"
                />
                <MetricCard
                    label="Half Days"
                    value={stats.halfDay}
                    accentColor="gold"
                />
                <MetricCard
                    label="Overtime Hours"
                    value={`${stats.overtime} hrs`}
                    accentColor="blue"
                />
            </div>

            {/* Calendar Controls */}
            <Card padding="md">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <Select
                            options={[
                                { value: 'all', label: 'All Employees' },
                                ...mockEmployees.map((emp) => ({ value: emp.id, label: emp.name })),
                            ]}
                            value={selectedEmployeeId}
                            onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            className="w-48"
                        />
                        <div className="flex items-center gap-2 ml-4">
                            <span className="text-sm text-[--color-text-muted]">Mark as:</span>
                            {(['present', 'absent', 'leave', 'half-day'] as AttendanceStatus[]).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setSelectedStatus(status)}
                                    className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                    transition-all
                    ${selectedStatus === status
                                            ? statusColors[status]
                                            : 'bg-[--color-bg-tertiary] text-[--color-text-muted] hover:bg-[--color-bg-elevated]'
                                        }
                  `}
                                >
                                    {statusIcons[status]}
                                    <span className="capitalize">{status.replace('-', ' ')}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Month Navigation */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                            aria-label="Previous month"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="text-lg font-medium text-[--color-text-primary] min-w-[160px] text-center">
                            {MONTHS[month - 1]} {year}
                        </span>
                        <button
                            onClick={handleNextMonth}
                            className="p-2 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                            aria-label="Next month"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                    {/* Day headers */}
                    {DAYS_OF_WEEK.map((day) => (
                        <div
                            key={day}
                            className="h-10 flex items-center justify-center text-xs font-medium text-[--color-text-muted] uppercase"
                        >
                            {day}
                        </div>
                    ))}

                    {/* Calendar days */}
                    {calendarDays.map((item, idx) => {
                        const record = item.date && selectedEmployeeId !== 'all'
                            ? getAttendanceForDay(item.date, selectedEmployeeId)
                            : null;
                        const isToday = item.date === formatDate(new Date());
                        const isFuture = item.date ? new Date(item.date) > new Date() : false;

                        return (
                            <button
                                key={idx}
                                onClick={() => item.date && handleDayClick(item.date)}
                                disabled={!item.day || selectedEmployeeId === 'all' || isFuture}
                                className={`
                  h-12 flex flex-col items-center justify-center rounded-[--radius-md]
                  transition-all
                  ${!item.day ? 'cursor-default' : ''}
                  ${item.day && selectedEmployeeId !== 'all' && !isFuture
                                        ? 'cursor-pointer hover:bg-[--color-bg-elevated]'
                                        : ''
                                    }
                  ${isToday ? 'ring-2 ring-[--color-accent-gold]' : ''}
                  ${record ? statusColors[record.status] : 'bg-[--color-bg-tertiary]'}
                  ${isFuture ? 'opacity-40' : ''}
                  disabled:cursor-not-allowed
                `}
                            >
                                {item.day && (
                                    <>
                                        <span className={`text-sm ${record ? '' : 'text-[--color-text-primary]'}`}>
                                            {item.day}
                                        </span>
                                        {record && (
                                            <span className="mt-0.5">
                                                {statusIcons[record.status]}
                                            </span>
                                        )}
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[--color-border]">
                    <span className="text-xs text-[--color-text-muted]">Legend:</span>
                    {Object.entries(statusColors).map(([status, color]) => (
                        <div key={status} className="flex items-center gap-1.5">
                            <div className={`w-3 h-3 rounded ${color}`} />
                            <span className="text-xs text-[--color-text-secondary] capitalize">
                                {status.replace('-', ' ')}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
