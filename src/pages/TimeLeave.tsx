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
    Loader2,
    CheckSquare,
    Square,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Button, Card, Select, MetricCard } from '../components/ui';
import type { AttendanceRecord } from '../lib/types';
import { getDaysInMonth, formatDate } from '../lib/utils';

// ================================
// Time & Leave Page
// Attendance with bulk marking
// ================================

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

type AttendanceStatus = 'present' | 'absent' | 'leave' | 'holiday' | 'half-day';
type ViewMode = 'calendar' | 'bulk';

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
    const {
        employees,
        attendance,
        attendanceLoading,
        markAttendance,
        updateAttendance,
        currentMonth,
        setCurrentMonth
    } = useApp();

    const [viewMode, setViewMode] = useState<ViewMode>('bulk');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('present');
    const [saving, setSaving] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
    const [bulkDate, setBulkDate] = useState(formatDate(new Date()));

    // Parse current month
    const [year, month] = currentMonth.split('-').map(Number);
    const daysInMonth = getDaysInMonth(year, month - 1);
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push({ day: null, date: '' });
        }
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

    // Toggle employee selection for bulk
    const toggleEmployeeSelection = (empId: string) => {
        setSelectedEmployees(prev =>
            prev.includes(empId)
                ? prev.filter(id => id !== empId)
                : [...prev, empId]
        );
    };

    // Select all employees
    const selectAllEmployees = () => {
        setSelectedEmployees(employees.map(e => e.id));
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedEmployees([]);
    };

    // Mark bulk attendance
    const handleBulkMark = async () => {
        if (selectedEmployees.length === 0) {
            alert('Please select at least one employee.');
            return;
        }

        setSaving(true);
        try {
            for (const empId of selectedEmployees) {
                const existing = getAttendanceForDay(bulkDate, empId);
                if (existing) {
                    await updateAttendance(existing.id, { status: selectedStatus });
                } else {
                    await markAttendance({
                        employeeId: empId,
                        date: bulkDate,
                        status: selectedStatus,
                        overtimeHours: 0,
                    });
                }
            }
            setSelectedEmployees([]);
        } catch (error) {
            console.error('Error marking attendance:', error);
            alert('Failed to mark attendance. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Toggle attendance for a day (calendar view)
    const handleDayClick = async (date: string) => {
        if (!date || selectedEmployeeId === 'all') return;

        setSaving(true);
        try {
            const existingRecord = getAttendanceForDay(date, selectedEmployeeId);

            if (existingRecord) {
                await updateAttendance(existingRecord.id, { status: selectedStatus });
            } else {
                await markAttendance({
                    employeeId: selectedEmployeeId,
                    date,
                    status: selectedStatus,
                    overtimeHours: 0,
                });
            }
        } catch (error) {
            console.error('Error saving attendance:', error);
            alert('Failed to save attendance. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Employee options for dropdown
    const employeeOptions = [
        { value: 'all', label: 'All Employees' },
        ...employees.map((emp) => ({ value: emp.id, label: emp.name })),
    ];

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">
                        Time & Leave
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1">
                        Track attendance, overtime, and leave
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode('bulk')}
                        className={`px-3 py-1.5 rounded-l-[--radius-md] text-sm font-medium transition-colors ${viewMode === 'bulk'
                            ? 'bg-[--color-accent-gold] text-[--color-text-inverse]'
                            : 'bg-[--color-bg-tertiary] text-[--color-text-muted]'
                            }`}
                    >
                        <Users className="w-4 h-4 inline mr-1" />
                        Bulk
                    </button>
                    <button
                        onClick={() => setViewMode('calendar')}
                        className={`px-3 py-1.5 rounded-r-[--radius-md] text-sm font-medium transition-colors ${viewMode === 'calendar'
                            ? 'bg-[--color-accent-gold] text-[--color-text-inverse]'
                            : 'bg-[--color-bg-tertiary] text-[--color-text-muted]'
                            }`}
                    >
                        <CalendarIcon className="w-4 h-4 inline mr-1" />
                        Calendar
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricCard label="Present Days" value={stats.present} accentColor="success" />
                <MetricCard label="Absent Days" value={stats.absent} accentColor="danger" />
                <MetricCard label="Leave Days" value={stats.leave} accentColor="warning" />
                <MetricCard label="Half Days" value={stats.halfDay} accentColor="gold" />
                <MetricCard label="Overtime Hours" value={`${stats.overtime} hrs`} accentColor="blue" />
            </div>

            {/* Loading state */}
            {attendanceLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : viewMode === 'bulk' ? (
                /* BULK ATTENDANCE VIEW */
                <Card padding="md">
                    <div className="space-y-4">
                        {/* Bulk Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[--color-border]">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                                <input
                                    type="date"
                                    value={bulkDate}
                                    onChange={(e) => setBulkDate(e.target.value)}
                                    className="h-10 px-3 bg-[--color-bg-tertiary] border border-[--color-border] rounded-[--radius-md] text-[--color-text-primary] w-full sm:w-auto"
                                />
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(['present', 'absent', 'leave', 'half-day'] as AttendanceStatus[]).map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => setSelectedStatus(status)}
                                            className={`
                                                flex items-center gap-1.5 px-3 py-2 rounded-[--radius-md] text-sm font-medium
                                                transition-all min-h-[40px] flex-1 sm:flex-none justify-center
                                                ${selectedStatus === status
                                                    ? `${statusColors[status]} ring-2 ring-offset-2 ring-offset-[--color-bg-primary] ring-white/40`
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
                            <Button
                                variant="primary"
                                onClick={handleBulkMark}
                                disabled={saving || selectedEmployees.length === 0}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                                Mark {selectedEmployees.length} Selected
                            </Button>
                        </div>

                        {/* Selection Controls */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={selectAllEmployees}
                                className="text-sm text-[--color-accent-gold] hover:underline"
                            >
                                Select All
                            </button>
                            <button
                                onClick={clearSelection}
                                className="text-sm text-[--color-text-muted] hover:underline"
                            >
                                Clear Selection
                            </button>
                            <span className="text-sm text-[--color-text-muted]">
                                {selectedEmployees.length} of {employees.length} selected
                            </span>
                        </div>

                        {/* Employee List */}
                        {employees.length === 0 ? (
                            <div className="text-center py-8 text-[--color-text-muted]">
                                No employees found. Add employees in the People page first.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {employees.map((emp) => {
                                    const isSelected = selectedEmployees.includes(emp.id);
                                    const todayRecord = getAttendanceForDay(bulkDate, emp.id);

                                    return (
                                        <div
                                            key={emp.id}
                                            onClick={() => toggleEmployeeSelection(emp.id)}
                                            className={`
                                                flex items-center justify-between p-3 rounded-[--radius-md] cursor-pointer
                                                transition-all border
                                                ${isSelected
                                                    ? 'bg-[--color-accent-gold]/10 border-[--color-accent-gold]'
                                                    : 'bg-[--color-bg-tertiary] border-transparent hover:bg-[--color-bg-elevated]'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-3">
                                                {isSelected ? (
                                                    <CheckSquare className="w-5 h-5 text-[--color-accent-gold]" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-[--color-text-muted]" />
                                                )}
                                                <div className="w-8 h-8 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center text-[--color-accent-gold] text-sm font-medium">
                                                    {emp.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-[--color-text-primary]">{emp.name}</p>
                                                    <p className="text-xs text-[--color-text-muted]">{emp.role} • {emp.department}</p>
                                                </div>
                                            </div>
                                            {todayRecord && (
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[todayRecord.status]}`}>
                                                    {todayRecord.status}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Card>
            ) : (
                /* CALENDAR VIEW */
                <Card padding="md">
                    {/* Calendar Controls */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <Select
                                options={employeeOptions}
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                className="w-full sm:w-48"
                            />

                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-[--color-text-muted] w-full sm:w-auto">Mark as:</span>
                                {(['present', 'absent', 'leave', 'half-day'] as AttendanceStatus[]).map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => setSelectedStatus(status)}
                                        className={`
                                            flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                            transition-all min-h-[32px] flex-1 sm:flex-none justify-center
                                            ${selectedStatus === status
                                                ? `${statusColors[status]} ring-2 ring-offset-2 ring-offset-[--color-bg-primary] ring-white/40`
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
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={handlePrevMonth}
                                className="p-2 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-lg font-medium text-[--color-text-primary] min-w-[140px] text-center">
                                {MONTHS[month - 1]} {year}
                            </span>
                            <button
                                onClick={handleNextMonth}
                                className="p-2 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {selectedEmployeeId === 'all' && (
                        <div className="mb-4 p-3 bg-[--color-bg-tertiary] rounded-[--radius-md] text-sm text-[--color-text-secondary]">
                            Select an employee to mark attendance on the calendar.
                        </div>
                    )}

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {DAYS_OF_WEEK.map((day) => (
                            <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-[--color-text-muted] uppercase">
                                {day}
                            </div>
                        ))}

                        {calendarDays.map((item, idx) => {
                            const record = item.date && selectedEmployeeId !== 'all'
                                ? getAttendanceForDay(item.date, selectedEmployeeId)
                                : null;
                            const isToday = item.date === formatDate(new Date());
                            const isFuture = item.date ? new Date(item.date) > new Date() : false;
                            const canClick = item.day && selectedEmployeeId !== 'all' && !isFuture && !saving;

                            return (
                                <button
                                    key={idx}
                                    onClick={() => canClick && handleDayClick(item.date)}
                                    disabled={!canClick}
                                    className={`
                                        h-11 sm:h-12 flex flex-col items-center justify-center rounded-[--radius-md]
                                        transition-all text-sm
                                        ${!item.day ? 'cursor-default' : ''}
                                        ${canClick ? 'cursor-pointer hover:ring-2 hover:ring-[--color-focus]' : ''}
                                        ${isToday ? 'ring-2 ring-[--color-accent-gold]' : ''}
                                        ${record ? statusColors[record.status] : item.day ? 'bg-[--color-bg-tertiary]' : ''}
                                        ${isFuture ? 'opacity-40' : ''}
                                        disabled:cursor-not-allowed
                                    `}
                                >
                                    {item.day && (
                                        <span className={record ? '' : 'text-[--color-text-primary]'}>
                                            {item.day}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-3 sm:gap-4 mt-4 pt-4 border-t border-[--color-border] flex-wrap">
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
            )}
        </div>
    );
}
