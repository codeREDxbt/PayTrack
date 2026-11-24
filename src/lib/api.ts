// ================================
// PayTrack API Client
// ================================
// One typed wrapper around the Phase 5 REST API. Every response is the
// `{ data }` envelope documented in docs/phase-5/api-reference.md; errors are turned
// into ApiError so pages can show the server's message instead of a stack.

import type {
    AttendanceRecord,
    AttendanceStatus,
    AttendanceSummaryRow,
    AuthUser,
    CreateAttendanceInput,
    CreateEmployeeInput,
    Dashboard,
    Employee,
    LateMark,
    MonthlyReport,
    PayrollEntry,
    PayrollStatus,
    Payslip,
    UpdateAttendanceInput,
    UpdateEmployeeInput,
} from './types';

const rawBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:4000/api';
export const API_BASE_URL = rawBase.replace(/\/+$/, '');

const TOKEN_KEY = 'paytrack.session.token';

export class ApiError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: string, message: string, status: number, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export function getStoredToken(): string | null {
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function storeToken(token: string | null): void {
    try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token);
        else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Private-mode storage failures must not break sign-in.
    }
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    auth?: boolean;
}

function parseBody(text: string): unknown {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getStoredToken();
    if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

    let body: string | undefined;
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method: options.method ?? 'GET',
            headers,
            body,
        });
    } catch {
        throw new ApiError(
            'NETWORK_ERROR',
            `Cannot reach the PayTrack API at ${API_BASE_URL}. Start it with "node server/index.js".`,
            0
        );
    }

    const payload = parseBody(await response.text()) as
        | { data?: unknown; error?: { code?: string; message?: string; details?: unknown } }
        | null;

    if (!response.ok) {
        if (response.status === 401 && options.auth !== false && path !== '/auth/login') {
            storeToken(null);
            window.dispatchEvent(new Event('paytrack:unauthorized'));
        }
        throw new ApiError(
            payload?.error?.code ?? 'INTERNAL',
            payload?.error?.message ?? `Request failed with HTTP ${response.status}`,
            response.status,
            payload?.error?.details
        );
    }

    return (payload?.data ?? null) as T;
}

function monthQuery(month?: string): string {
    return month ? `?month=${encodeURIComponent(month)}` : '';
}

export const api = {
    // ---- auth ----
    login(email: string, password: string) {
        return request<{ token: string; tokenType: string; expiresAt: string; user: AuthUser }>(
            '/auth/login',
            { method: 'POST', body: { email, password }, auth: false }
        );
    },

    me() {
        return request<{ user: AuthUser }>('/auth/me');
    },

    logout() {
        return request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
    },

    // ---- employees ----
    employees(params: { search?: string; department?: string; status?: string } = {}) {
        const query = new URLSearchParams();
        if (params.search) query.set('search', params.search);
        if (params.department) query.set('department', params.department);
        if (params.status) query.set('status', params.status);
        const suffix = query.toString() ? `?${query.toString()}` : '';
        return request<{ employees: Employee[] }>(`/employees${suffix}`);
    },

    employee(id: number) {
        return request<{ employee: Employee }>(`/employees/${id}`);
    },

    createEmployee(input: CreateEmployeeInput) {
        return request<{ employee: Employee }>('/employees', { method: 'POST', body: input });
    },

    updateEmployee(id: number, input: UpdateEmployeeInput) {
        return request<{ employee: Employee }>(`/employees/${id}`, { method: 'PATCH', body: input });
    },

    deleteEmployee(id: number) {
        return request<{ deleted: boolean; employeeId: number }>(`/employees/${id}`, { method: 'DELETE' });
    },

    // ---- attendance ----
    attendance(month: string, employeeId?: number) {
        const query = new URLSearchParams({ month });
        if (employeeId !== undefined) query.set('employeeId', String(employeeId));
        return request<{ month: string; attendance: AttendanceRecord[] }>(`/attendance?${query.toString()}`);
    },

    employeeAttendance(employeeId: number, month: string) {
        return request<{ month: string; employeeId: number; attendance: AttendanceRecord[] }>(
            `/employees/${employeeId}/attendance${monthQuery(month)}`
        );
    },

    createAttendance(input: CreateAttendanceInput) {
        return request<{ attendance: AttendanceRecord }>('/attendance', { method: 'POST', body: input });
    },

    updateAttendance(id: number, input: UpdateAttendanceInput) {
        return request<{ attendance: AttendanceRecord }>(`/attendance/${id}`, { method: 'PATCH', body: input });
    },

    attendanceSummary(month: string) {
        return request<{ month: string; attendance: AttendanceSummaryRow[] }>(
            `/attendance/summary${monthQuery(month)}`
        );
    },

    lateMarks(month: string) {
        return request<{ month: string; lateMarks: LateMark[] }>(`/attendance/late${monthQuery(month)}`);
    },

    // ---- payroll ----
    payroll(month: string) {
        return request<{
            month: string;
            payroll: PayrollEntry[];
            totals: { grossSalary: number; netSalary: number; taxDeduction: number };
        }>(`/payroll${monthQuery(month)}`);
    },

    myPayroll(month: string) {
        return request<{ month: string; payroll: PayrollEntry[] }>(`/payroll/me${monthQuery(month)}`);
    },

    generatePayroll(month: string) {
        return request<{
            month: string;
            generated: number;
            recalculated: number;
            computedFrom: string;
            payroll: PayrollEntry[];
        }>('/payroll/generate', { method: 'POST', body: { month } });
    },

    payslip(payrollId: number) {
        return request<{ payslip: Payslip }>(`/payroll/${payrollId}/payslip`);
    },

    setPayrollStatus(payrollId: number, status: PayrollStatus, paymentDate?: string) {
        return request<{ payrollId: number; status: PayrollStatus; paymentDate: string | null }>(
            `/payroll/${payrollId}/status`,
            { method: 'PATCH', body: { status, ...(paymentDate ? { paymentDate } : {}) } }
        );
    },

    // ---- reports ----
    monthlyReport(month: string) {
        return request<MonthlyReport>(`/reports/monthly${monthQuery(month)}`);
    },

    dashboard(month: string) {
        return request<Dashboard>(`/me/dashboard${monthQuery(month)}`);
    },
};

export type { AttendanceStatus };
