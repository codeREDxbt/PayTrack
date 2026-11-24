import { useMemo, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Loader2, Download, Mail, Phone } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Input, Select, Modal, FilterPills } from '../components/ui';
import { EmployeeCard } from '../components/EmployeeCard';
import { useIsMobile } from '../hooks/useResponsive';
import { formatDateReadable, todayIso } from '../lib/format';
import { exportToCSV } from '../lib/utils';
import type {
    CreateEmployeeInput,
    Employee,
    EmployeeStatus,
    FilterPill,
    SystemRole,
    UpdateEmployeeInput,
} from '../lib/types';

// ================================
// People Directory (staff only)
// Admin/HR see every row GET /employees returns; the API is the enforcer, this
// page is the console. Deleting is ADMIN-only, matching DELETE /employees/:id.
// ================================

const DEFAULT_DEPARTMENTS = [
    'Engineering',
    'Sales',
    'Marketing',
    'Human Resources',
    'Finance',
    'Operations',
    'Product',
    'Labor',
];

interface FormState {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    department: string;
    jobTitle: string;
    systemRole: SystemRole;
    joinDate: string;
    status: EmployeeStatus;
    baseSalary: string;
    hra: string;
    allowances: string;
}

const emptyForm = (): FormState => ({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: 'Engineering',
    jobTitle: '',
    systemRole: 'EMPLOYEE',
    joinDate: todayIso(),
    status: 'ACTIVE',
    baseSalary: '',
    hra: '0',
    allowances: '0',
});

export function People() {
    const { employees, loading, addEmployee, updateEmployee, deleteEmployee } = useApp();
    const { user } = useAuth();
    const isMobile = useIsMobile();

    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [status, setStatus] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<Employee | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const departments = useMemo(
        () => Array.from(new Set([...DEFAULT_DEPARTMENTS, ...employees.map((e) => e.department)])),
        [employees]
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return [...employees]
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
            .filter((employee) => {
                const matchesTerm =
                    !term ||
                    employee.fullName.toLowerCase().includes(term) ||
                    employee.jobTitle.toLowerCase().includes(term) ||
                    employee.email.toLowerCase().includes(term);
                const matchesDepartment = !department || employee.department === department;
                const matchesStatus = !status || employee.status === status;
                return matchesTerm && matchesDepartment && matchesStatus;
            });
    }, [employees, search, department, status]);

    const filters: FilterPill[] = [];
    if (department) filters.push({ id: 'department', label: 'Department', value: department });
    if (status) filters.push({ id: 'status', label: 'Status', value: status });

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm());
        setFormError(null);
        setIsFormOpen(true);
    };

    const openEdit = (employee: Employee) => {
        setEditing(employee);
        setForm({
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            phone: employee.phone ?? '',
            department: employee.department,
            jobTitle: employee.jobTitle,
            systemRole: employee.systemRole,
            joinDate: employee.joinDate.slice(0, 10),
            status: employee.status,
            baseSalary: '',
            hra: '0',
            allowances: '0',
        });
        setFormError(null);
        setIsFormOpen(true);
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            if (editing) {
                const updates: UpdateEmployeeInput = {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    email: form.email,
                    phone: form.phone || undefined,
                    department: form.department,
                    role: form.jobTitle,
                    systemRole: form.systemRole,
                    joinDate: form.joinDate,
                    status: form.status,
                };
                await updateEmployee(editing.employeeId, updates);
            } else {
                const input: CreateEmployeeInput = {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    email: form.email,
                    phone: form.phone || undefined,
                    department: form.department,
                    role: form.jobTitle,
                    systemRole: form.systemRole,
                    joinDate: form.joinDate,
                    status: form.status,
                    baseSalary: Number(form.baseSalary),
                    hra: Number(form.hra || 0),
                    allowances: Number(form.allowances || 0),
                };
                if (!Number.isFinite(input.baseSalary) || input.baseSalary < 0) {
                    throw new Error('Base salary must be zero or more.');
                }
                await addEmployee(input);
            }
            setIsFormOpen(false);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not save the employee.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (employee: Employee) => {
        if (!window.confirm(`Delete ${employee.fullName}? Salary, attendance and payroll rows cascade with the employee.`)) {
            return;
        }
        try {
            await deleteEmployee(employee.employeeId);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not delete the employee.');
        }
    };

    const handleExport = () => {
        exportToCSV(
            filtered.map((employee) => ({
                'Employee ID': employee.employeeId,
                Name: employee.fullName,
                Email: employee.email,
                Phone: employee.phone ?? '',
                Role: employee.jobTitle,
                Department: employee.department,
                'System Role': employee.systemRole,
                'Join Date': employee.joinDate,
                Status: employee.status,
            })),
            `Employees_${todayIso()}`
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">People</h1>
                    <p className="text-[--color-text-secondary] mt-1 font-bold tracking-widest uppercase text-xs">
                        {employees.length} employees on record
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={handleExport} className="border-2 border-[--color-border]">
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                    </Button>
                    <Button variant="primary" size="sm" onClick={openCreate}>
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add employee</span>
                    </Button>
                </div>
            </div>

            <Card padding="md">
                <div className="flex flex-col gap-4">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--color-text-muted]" />
                        <input
                            type="text"
                            placeholder="Search by name, role or email..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="w-full h-10 pl-10 pr-4 bg-[--color-bg-tertiary] border-2 border-[--color-border]
                                rounded-[--radius-md] text-sm text-[--color-text-primary]
                                placeholder:text-[--color-text-muted] focus:outline-none focus:ring-2 focus:ring-[--color-focus]"
                        />
                    </div>
                    <div className="grid grid-cols-2 sm:flex gap-2">
                        <Select
                            options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
                            value={department}
                            onChange={(event) => setDepartment(event.target.value)}
                            className="w-full sm:w-52"
                        />
                        <Select
                            options={[
                                { value: '', label: 'All statuses' },
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'INACTIVE', label: 'Inactive' },
                                { value: 'TERMINATED', label: 'Terminated' },
                            ]}
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                            className="w-full sm:w-40"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setDepartment('');
                                setStatus('');
                                setSearch('');
                            }}
                        >
                            Clear
                        </Button>
                    </div>
                    <FilterPills
                        filters={filters}
                        onRemove={(id) => {
                            if (id === 'department') setDepartment('');
                            if (id === 'status') setStatus('');
                        }}
                        onClearAll={() => {
                            setDepartment('');
                            setStatus('');
                        }}
                    />
                </div>
            </Card>

            {loading && employees.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[--color-accent-gold]" />
                </div>
            ) : isMobile ? (
                <div className="space-y-3">
                    {filtered.map((employee) => (
                        <EmployeeCard key={employee.employeeId} employee={employee} onClick={() => openEdit(employee)} />
                    ))}
                    {filtered.length === 0 && <p className="text-center py-12 text-[--color-text-muted]">No employees found</p>}
                </div>
            ) : (
                <Card padding="none">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px]">
                            <thead>
                                <tr className="border-b-2 border-[--color-border] bg-[--color-bg-secondary]">
                                    {['Employee', 'Role', 'Department', 'Contact', 'Joined', 'Status', ''].map((heading) => (
                                        <th
                                            key={heading}
                                            className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3"
                                        >
                                            {heading}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-[--color-border]">
                                {filtered.map((employee) => (
                                    <tr key={employee.employeeId} className="hover:bg-[--color-bg-tertiary] transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center text-[--color-accent-gold] font-medium">
                                                    {employee.firstName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-[--color-text-primary]">{employee.fullName}</p>
                                                    <p className="text-xs text-[--color-text-muted]">
                                                        #{employee.employeeId} &bull; {employee.systemRole}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[--color-text-secondary]">{employee.jobTitle}</td>
                                        <td className="px-4 py-3 text-sm text-[--color-text-secondary]">{employee.department}</td>
                                        <td className="px-4 py-3 text-xs text-[--color-text-secondary]">
                                            <span className="flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> {employee.email}
                                            </span>
                                            {employee.phone && (
                                                <span className="flex items-center gap-1 mt-0.5 text-[--color-text-muted]">
                                                    <Phone className="w-3 h-3" /> {employee.phone}
                                                </span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-[--color-text-secondary]">
                                            {formatDateReadable(employee.joinDate)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    employee.status === 'ACTIVE'
                                                        ? 'bg-[--color-success]/10 text-[--color-success]'
                                                        : employee.status === 'TERMINATED'
                                                            ? 'bg-[--color-danger]/10 text-[--color-danger]'
                                                            : 'bg-[--color-text-muted]/10 text-[--color-text-muted]'
                                                }`}
                                            >
                                                {employee.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openEdit(employee)}
                                                    className="p-1.5 text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-elevated]"
                                                    aria-label="Edit employee"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                {user?.systemRole === 'ADMIN' && employee.employeeId !== user.employeeId && (
                                                    <button
                                                        onClick={() => handleDelete(employee)}
                                                        className="p-1.5 text-[--color-text-muted] hover:text-[--color-danger] hover:bg-[--color-danger]/10"
                                                        aria-label="Delete employee"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filtered.length === 0 && <p className="text-center py-12 text-[--color-text-muted]">No employees found</p>}
                    </div>
                </Card>
            )}

            <Modal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                title={editing ? `Edit ${editing.fullName}` : 'Add employee'}
                size="lg"
            >
                <form onSubmit={handleSave} className="space-y-4">
                    {formError && (
                        <p className="text-sm text-[--color-danger] bg-[--color-danger]/10 border border-[--color-danger]/30 p-2">
                            {formError}
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="First name"
                            value={form.firstName}
                            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                            required
                        />
                        <Input
                            label="Last name"
                            value={form.lastName}
                            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Email"
                            type="email"
                            value={form.email}
                            onChange={(event) => setForm({ ...form, email: event.target.value })}
                            required
                        />
                        <Input
                            label="Phone"
                            value={form.phone}
                            onChange={(event) => setForm({ ...form, phone: event.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Select
                            label="Department"
                            options={departments.map((d) => ({ value: d, label: d }))}
                            value={form.department}
                            onChange={(event) => setForm({ ...form, department: event.target.value })}
                        />
                        <Input
                            label="Job title"
                            value={form.jobTitle}
                            onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
                            required
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <Select
                            label="System role"
                            options={[
                                { value: 'EMPLOYEE', label: 'Employee' },
                                { value: 'HR', label: 'HR' },
                                { value: 'ADMIN', label: 'Admin' },
                            ]}
                            value={form.systemRole}
                            onChange={(event) => setForm({ ...form, systemRole: event.target.value as SystemRole })}
                        />
                        <Select
                            label="Status"
                            options={[
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'INACTIVE', label: 'Inactive' },
                                { value: 'TERMINATED', label: 'Terminated' },
                            ]}
                            value={form.status}
                            onChange={(event) => setForm({ ...form, status: event.target.value as EmployeeStatus })}
                        />
                        <Input
                            label="Join date"
                            type="date"
                            value={form.joinDate}
                            onChange={(event) => setForm({ ...form, joinDate: event.target.value })}
                            required
                        />
                    </div>

                    {!editing && (
                        <div className="grid grid-cols-3 gap-3">
                            <Input
                                label="Base salary"
                                type="number"
                                min="0"
                                value={form.baseSalary}
                                onChange={(event) => setForm({ ...form, baseSalary: event.target.value })}
                                required
                            />
                            <Input
                                label="HRA"
                                type="number"
                                min="0"
                                value={form.hra}
                                onChange={(event) => setForm({ ...form, hra: event.target.value })}
                            />
                            <Input
                                label="Allowances"
                                type="number"
                                min="0"
                                value={form.allowances}
                                onChange={(event) => setForm({ ...form, allowances: event.target.value })}
                            />
                        </div>
                    )}

                    <p className="text-xs text-[--color-text-muted]">
                        {editing
                            ? 'Salary packages are immutable history; create a new package through the database rather than editing an existing payslip.'
                            : 'The employee and its active Salary row are written in one transaction by the API.'}
                    </p>

                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsFormOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" className="flex-1" isLoading={saving}>
                            {editing ? 'Save changes' : 'Add employee'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
