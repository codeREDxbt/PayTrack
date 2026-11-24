// ================================
// Display formatting helpers
// ================================

/** Indian-rupee style currency used across the UI. */
export function formatCurrency(amount: number | null | undefined, symbol = '₹'): string {
    const value = Number(amount ?? 0);
    // Payroll figures always carry two decimals so columns line up as a
    // ledger (₹46,946.60, not ₹46,946.6) and totals scan cleanly.
    return `${symbol}${value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export function formatMonthLabel(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    if (!year || !monthNumber) return month;
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    });
}

export function formatMonthShort(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    if (!year || !monthNumber) return month;
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

/** The last `count` months, oldest first, ending at `endMonth` (YYYY-MM). */
export function recentMonths(endMonth: string, count = 6): string[] {
    const [year, monthNumber] = endMonth.split('-').map(Number);
    const months: string[] = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
        const date = new Date(year, monthNumber - 1 - offset, 1);
        months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
}

/** Month options for a select control, newest first. */
export function monthOptions(endMonth: string, count = 12): { value: string; label: string }[] {
    return recentMonths(endMonth, count)
        .reverse()
        .map((month) => ({ value: month, label: formatMonthLabel(month) }));
}

export function formatDateReadable(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Local YYYY-MM-DD (not UTC, so "today" matches the user's calendar). */
export function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

export function monthKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}
