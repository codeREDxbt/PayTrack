import { useMemo, useState } from 'react';
import {
    Check,
    X as XIcon,
    Coffee,
    Calendar as CalendarIcon,
    Clock,
    Users,
    Loader2,
    AlertTriangle,
    CheckSquare,
    Square,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Select, MetricCard } from '../components/ui';
import type { AttendanceStatus } from '../lib/types';
import {
    formatDateReadable,
    formatMonthLabel,
    monthOptions,
    todayIso,
} from '../lib/format';

// ================================
// Time & Leave
// Staff edit attendance (POST/PATCH /attendance); an EMPLOYEE gets the same page
// read-only, scoped by the API to their own rows. Statuses are the Phase 1
// enum values, not a UI-only vocabulary.
// ================================

const STATUS_META: Record<AttendanceStatus, { label: string; badge: string; icon: React.ReactNode }> = {
    PRESENT: { label: 'Present', badge: 'bg-success text-white', icon: <Check className="w-4 h-4" /> },
    ABSENT: { label: 'Absent', badge: 'bg-danger text-white', icon: <XIcon className="w-4 h-4" /> },
    HALF_DAY: { label: 'Half day', badge: 'bg-accent-gold text-black', icon: <Clock className="w-4 h-4" /> },
    ON_LEAVE: { label: 'On leave', badge: 'bg-warning text-black', icon: <Coffee className="w-4 h-4" /> },
    HOLIDAY: { label: 'Holiday', badge: 'bg-accent-blue text-white', icon: <CalendarIcon className="w-4 h-4" /> },
};

const MARKABLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'];
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TimeLeave() {
    const { user } = useAuth();
    const {
        employees,
        attendance,
        loading,
        markAttendance,
        updateAttendance,
        currentMonth,
        setCurrentMonth,
        error,
    } = useApp();
    const isStaff = user?.isStaff ?? false;

    const [calendarEmployee, setCalendarEmployee] = useState<string>(
        isStaff ? '' : String(user?.employeeId ?? '')
    );
    const [markStatus, setMarkStatus] = useState<AttendanceStatus>('PRESENT');
    const [bulkDate, setBulkDate] = useState(todayIso());
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);

    const months = useMemo(() => monthOptions(currentMonth), [currentMonth]);
    const visibleEmployees = useMemo(
        () => (isStaff ? employees : employees.filter((e) => e.employeeId === user?.employeeId)),
        [employees, isStaff, user?.employeeId]
    );

    const [year, monthNumber] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
    const today = todayIso();

    const stats = useMemo(
        () => ({
            present: attendance.filter((r) => r.status === 'PRESENT').length,
            absent: attendance.filter((r) => r.status === 'ABSENT').length,
            leave: attendance.filter((r) => r.status === 'ON_LEAVE').length,
            half: attendance.filter((r) => r.status === 'HALF_DAY').length,
            overtime: attendance.reduce((sum, r) => sum + r.overtimeHours, 0),
            late: attendance.filter((r) => r.isLate).length,
        }),
        [attendance]
    );

    const calendarAttendance = useMemo(() => {
        const employeeId = Number(calendarEmployee);
        const map = new Map<string, (typeof attendance)[number]>();
        if (!employeeId) return map;
        for (const record of attendance) {
            if (record.employeeId === employeeId) map.set(record.date, record);
        }
        return map;
    }, [attendance, calendarEmployee]);

    const upsert = async (employeeId: number, date: string, status: AttendanceStatus) => {
        const existing = attendance.find((r) => r.employeeId === employeeId && r.date === date);
        if (existing) await updateAttendance(existing.attendanceId, { status });
        else await markAttendance({ employeeId, date, status });
    };

    const handleCellClick = async (date: string) => {
        if (!isStaff || !calendarEmployee || date > today) return;
        setSaving(true);
        try {
            await upsert(Number(calendarEmployee), date, markStatus);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not save attendance.');
        } finally {
            setSaving(false);
        }
    };

    const toggleSelected = (id: number) => {
        setSelectedIds((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
        );
    };

    const handleBulkMark = async () => {
        if (!selectedIds.length) return;
        setSaving(true);
        try {
            for (const id of selectedIds) {
                await upsert(id, bulkDate, markStatus);
            }
            setSelectedIds([]);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Bulk marking failed.');
        } finally {
            setSaving(false);
        }
    };

    const cells = useMemo(() => {
        const result: (string | null)[] = [];
        for (let i = 0; i < firstWeekday; i += 1) result.push(null);
        for (let day = 1; day <= daysInMonth; day += 1) {
            result.push(`${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }
        return result;
    }, [daysInMonth, firstWeekday, monthNumber, year]);

    const monthRecords = useMemo(
        () => [...attendance].sort((a, b) => a.date.localeCompare(b.date) || a.employeeId - b.employeeId),
        [attendance]
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">
                        {isStaff ? 'Time & Leave' : 'My Attendance'}
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1 text-xs font-bold uppercase tracking-widest">
                        {isStaff ? 'Mark and correct attendance' : 'Read-only view of your own record'} for{' '}
                        {formatMonthLabel(currentMonth)}
                    </p>
                </div>
                <Select
                    options={months}
                    value={currentMonth}
                    onChange={(event) => setCurrentMonth(event.target.value)}
                    className="w-44"
                />
            </div>

            {error && (
                <Card padding="md" className="border-[--color-danger] bg-[--color-danger]/5">
                    <p className="flex items-center gap-2 text-sm text-[--color-danger]">
                        <AlertTriangle className="w-4 h-4" /> {error}
                    </p>
                </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <MetricCard label="Present" value={stats.present} accentColor="success" />
                <MetricCard label="Absent" value={stats.absent} accentColor="danger" />
                <MetricCard label="Leave" value={stats.leave} accentColor="warning" />
                <MetricCard label="Half days" value={stats.half} accentColor="gold" />
                <MetricCard label="Late marks" value={stats.late} accentColor="warning" />
                <MetricCard label="Overtime hrs" value={stats.overtime} accentColor="blue" />
            </div>

            {isStaff && (
                <Card padding="md">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[--color-text-primary] mb-3">
                        Bulk marking
                    </h2>
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold uppercase tracking-widest text-[--color-text-secondary]">
                                Date
                            </label>
                            <input
                                type="date"
                                value={bulkDate}
                                max={today}
                                onChange={(event) => setBulkDate(event.target.value)}
                                className="h-10 px-3 bg-[--color-bg-tertiary] border-2 border-[--color-border]
                                    text-[--color-text-primary] font-bold focus:border-[--color-focus] outline-none"
                            />
                        </div>
                        <Select
                            label="Status"
                            options={MARKABLE.map((status) => ({ value: status, label: STATUS_META[status].label }))}
                            value={markStatus}
                            onChange={(event) => setMarkStatus(event.target.value as AttendanceStatus)}
                            className="w-full lg:w-40"
                        />
                        <Button variant="secondary" size="sm" onClick={() => setSelectedIds(visibleEmployees.map((e) => e.employeeId))}>
                            <CheckSquare className="w-4 h-4" /> Select all
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                            Clear
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleBulkMark}
                            disabled={!selectedIds.length || saving}
                            isLoading={saving}
                        >
                            <Check className="w-4 h-4" />
                            Mark {selectedIds.length}
                        </Button>
                    </div>

                    <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-[--color-border] border border-[--color-border]">
                        {visibleEmployees.map((employee) => {
                            const selected = selectedIds.includes(employee.employeeId);
                            const existing = attendance.find(
                                (r) => r.employeeId === employee.employeeId && r.date === bulkDate
                            );
                            return (
                                <button
                                    key={employee.employeeId}
                                    onClick={() => toggleSelected(employee.employeeId)}
                                    className={`w-full flex items-center justify-between gap-3 p-2 text-left transition-colors ${
                                        selected ? 'bg-[--color-accent-gold]/10' : 'hover:bg-[--color-bg-tertiary]'
                                    }`}
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        {selected ? (
                                            <CheckSquare className="w-4 h-4 text-[--color-accent-gold]" />
                                        ) : (
                                            <Square className="w-4 h-4 text-[--color-text-muted]" />
                                        )}
                                        <span className="truncate text-sm text-[--color-text-primary]">
                                            {employee.fullName}
                                        </span>
                                        <span className="hidden sm:inline text-xs text-[--color-text-muted]">
                                            {employee.department}
                                        </span>
                                    </span>
                                    {existing ? (
                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_META[existing.status].badge}`}>
                                            {STATUS_META[existing.status].label}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] uppercase tracking-widest text-[--color-text-muted]">
                                            Not marked
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </Card>
            )}

            <Card padding="md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[--color-text-primary]">
                        Calendar
                    </h2>
                    <div className="flex items-center gap-2">
                        {isStaff ? (
                            <Select
                                options={[
                                    { value: '', label: 'Select employee' },
                                    ...visibleEmployees.map((employee) => ({
                                        value: String(employee.employeeId),
                                        label: employee.fullName,
                                    })),
                                ]}
                                value={calendarEmployee}
                                onChange={(event) => setCalendarEmployee(event.target.value)}
                                className="w-52"
                            />
                        ) : (
                            <span className="text-xs uppercase tracking-widest text-[--color-text-muted]">
                                {user?.fullName}
                            </span>
                        )}
                        {isStaff && (
                            <div className="flex items-center gap-1">
                                {MARKABLE.map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => setMarkStatus(status)}
                                        title={STATUS_META[status].label}
                                        className={`p-1.5 border-2 ${
                                            markStatus === status
                                                ? 'border-[--color-text-primary] bg-[--color-bg-tertiary]'
                                                : 'border-transparent text-[--color-text-muted]'
                                        }`}
                                    >
                                        {STATUS_META[status].icon}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-7 gap-1">
                            {DAYS_OF_WEEK.map((day) => (
                                <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-[--color-text-muted] uppercase">
                                    {day}
                                </div>
                            ))}
                            {cells.map((date, index) => {
                                const record = date ? calendarAttendance.get(date) : undefined;
                                const clickable = Boolean(isStaff && calendarEmployee && date && date <= today);
                                return (
                                    <button
                                        key={`${date ?? 'blank'}-${index}`}
                                        onClick={() => date && void handleCellClick(date)}
                                        disabled={!clickable}
                                        className={`h-12 flex flex-col items-center justify-center border-2 text-xs font-bold transition-all ${
                                            record ? `${STATUS_META[record.status].badge} border-[--color-text-primary]` : 'bg-[--color-bg-tertiary] border-[--color-border]'
                                        } ${date === today ? 'ring-2 ring-[--color-accent-gold]' : ''} ${
                                            clickable ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'
                                        }`}
                                    >
                                        {date ? Number(date.slice(8)) : ''}
                                        {record?.isLate && <span className="text-[9px] uppercase">late</span>}
                                    </button>
                                );
                            })}
                        </div>
                        {isStaff && !calendarEmployee && (
                            <p className="mt-3 text-xs text-[--color-text-muted]">
                                Select an employee to mark or correct their days.
                            </p>
                        )}
                    </>
                )}
            </Card>

            <Card padding="none">
                <div className="p-4 flex items-center justify-between">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[--color-text-primary]">
                        {formatMonthLabel(currentMonth)} records
                    </h2>
                    <span className="text-xs text-[--color-text-muted] flex items-center gap-1">
                        <Users className="w-3 h-3" /> {monthRecords.length} rows
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                        <thead>
                            <tr className="border-y-2 border-[--color-border] bg-[--color-bg-secondary]">
                                {['Date', ...(isStaff ? ['Employee'] : []), 'Status', 'In', 'Out', 'Hours', 'OT', 'Late'].map((heading) => (
                                    <th key={heading} className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-2">
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[--color-border]">
                            {monthRecords.map((record) => {
                                const employee = employees.find((e) => e.employeeId === record.employeeId);
                                return (
                                    <tr key={record.attendanceId} className="hover:bg-[--color-bg-tertiary]">
                                        <td className="whitespace-nowrap px-4 py-2 text-sm text-[--color-text-primary]">
                                            {formatDateReadable(record.date)}
                                        </td>
                                        {isStaff && (
                                            <td className="px-4 py-2 text-sm text-[--color-text-secondary]">
                                                {employee?.fullName ?? record.employeeName ?? `#${record.employeeId}`}
                                            </td>
                                        )}
                                        <td className="px-4 py-2">
                                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_META[record.status].badge}`}>
                                                {STATUS_META[record.status].label}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2 text-right text-xs tabular-nums text-[--color-text-secondary]">{record.checkInTime ?? '—'}</td>
                                        <td className="whitespace-nowrap px-4 py-2 text-right text-xs tabular-nums text-[--color-text-secondary]">{record.checkOutTime ?? '—'}</td>
                                        <td className="px-4 py-2 text-right text-xs tabular-nums text-[--color-text-secondary]">{record.hoursWorked}</td>
                                        <td className="px-4 py-2 text-right text-xs tabular-nums text-[--color-text-secondary]">{record.overtimeHours}</td>
                                        <td className="px-4 py-2 text-right text-xs tabular-nums">
                                            {record.isLate ? (
                                                <span className="text-[--color-warning]">{record.lateMinutes}m</span>
                                            ) : (
                                                <span className="text-[--color-text-muted]">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {monthRecords.length === 0 && (
                        <p className="text-center py-10 text-[--color-text-muted]">No attendance recorded for this month.</p>
                    )}
                </div>
            </Card>
        </div>
    );
}
