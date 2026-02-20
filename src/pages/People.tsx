import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Plus,
    Search,
    Filter,
    Edit2,
    Eye,
    Trash2,
    Download,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
    Button,
    Card,
    Input,
    Select,
    Drawer,
    Modal,
    FilterPills,
} from '../components/ui';
import { EmployeeCard } from '../components/EmployeeCard';
import { useIsMobile } from '../hooks/useResponsive';
import type { Employee, EmployeeFormData, FilterPill } from '../lib/types';
import { formatCurrency } from '../utils/salaryCalculator';
import { formatDateReadable, exportToCSV } from '../lib/utils';

// ================================
// People Directory
// Employee table with filtering
// ================================

// Department options for dropdown
const departments = [
    { value: 'engineering', label: 'Engineering' },
    { value: 'sales', label: 'Sales' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'hr', label: 'HR' },
    { value: 'finance', label: 'Finance' },
    { value: 'operations', label: 'Operations' },
    { value: 'labor', label: 'Labor' },
];

export function People() {
    const { employees, addEmployee, updateEmployee, deleteEmployee, setSelectedEmployeeId } = useApp();
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    // Sort employees by name client-side
    const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name));

    // Build active filters for display
    const activeFilters = useMemo(() => {
        const filters: FilterPill[] = [];
        if (selectedDepartment) {
            filters.push({
                id: 'department',
                label: 'Department',
                value: departments.find(d => d.value === selectedDepartment)?.label || selectedDepartment,
            });
        }
        if (selectedStatus) {
            filters.push({
                id: 'status',
                label: 'Status',
                value: selectedStatus === 'active' ? 'Active' : 'Inactive',
            });
        }
        return filters;
    }, [selectedDepartment, selectedStatus]);

    // Filter employees
    const filteredEmployees = useMemo(() => {
        return sortedEmployees.filter((emp) => {
            const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.role.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDepartment = !selectedDepartment || emp.department.toLowerCase() === selectedDepartment;
            const matchesStatus = !selectedStatus || emp.status === selectedStatus;
            return matchesSearch && matchesDepartment && matchesStatus;
        });
    }, [sortedEmployees, searchQuery, selectedDepartment, selectedStatus]);

    const handleRemoveFilter = (id: string) => {
        if (id === 'department') setSelectedDepartment('');
        if (id === 'status') setSelectedStatus('');
    };

    const handleClearAllFilters = () => {
        setSelectedDepartment('');
        setSelectedStatus('');
        setSearchQuery('');
    };

    const handleViewEmployee = (employee: Employee) => {
        setSelectedEmployee(employee);
        setIsDrawerOpen(true);
    };

    const handleAddEmployee = () => {
        setEditingEmployee(null);
        setIsModalOpen(true);
    };

    const handleEditEmployee = (employee: Employee) => {
        setEditingEmployee(employee);
        setIsModalOpen(true);
    };

    const handleSaveEmployee = async (data: EmployeeFormData) => {
        try {
            if (editingEmployee) {
                // Update existing in Firestore
                await updateEmployee(editingEmployee.id, data);
            } else {
                // Add new to Firestore
                await addEmployee({
                    ...data,
                    status: 'active',
                });
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error('Error saving employee:', error);
            alert('Failed to save employee. Please try again.');
        }
    };

    const handleDeleteEmployee = async (employee: Employee) => {
        if (window.confirm(`Are you sure you want to delete ${employee.name}? This action cannot be undone.`)) {
            try {
                await deleteEmployee(employee.id);
                // Clear the selected employee ID from context to prevent stale data in Attendance page
                setSelectedEmployeeId(null);
                setIsDrawerOpen(false);
                setSelectedEmployee(null);
            } catch (error) {
                console.error('Error deleting employee:', error);
                alert('Failed to delete employee. Please try again.');
            }
        }
    };

    const handleExportCSV = () => {
        const exportData = filteredEmployees.map(emp => ({
            'Employee ID': emp.id,
            'Name': emp.name,
            'Role': emp.role,
            'Department': emp.department,
            'Monthly Pay': emp.monthlyPay,
            'Join Date': formatDateReadable(emp.joinDate),
            'Status': emp.status,
            'Email': emp.email || '',
            'Phone': emp.phone || ''
        }));
        exportToCSV(exportData, `Employees_Export_${new Date().toISOString().split('T')[0]}`);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-widest text-[--color-text-primary]">
                        People
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1 font-bold tracking-widest uppercase text-xs">
                        Manage your {sortedEmployees.length} employees
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" size="sm" onClick={handleExportCSV} className="border-2 border-[--color-border]">
                        <Download className="w-4 h-4" />
                        Export
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleAddEmployee} className="hidden sm:flex border-2 border-[--color-border]">
                        <Plus className="w-4 h-4" />
                        Add Employee
                    </Button>
                </div>
            </div>

            {/* Filters Bar */}
            <Card padding="md">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--color-text-muted]" />
                            <input
                                type="text"
                                placeholder="Search by name or role..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="
                  w-full h-9 pl-10 pr-4
                  bg-[--color-bg-tertiary]
                  border border-[--color-border]
                  rounded-[--radius-md]
                  text-sm text-[--color-text-primary]
                  placeholder:text-[--color-text-muted]
                  focus:outline-none focus:ring-2 focus:ring-[--color-focus]
                "
                            />
                        </div>

                        {/* Quick Filters */}
                        <Select
                            options={[{ value: '', label: 'All Departments' }, ...departments]}
                            value={selectedDepartment}
                            onChange={(e) => setSelectedDepartment(e.target.value)}
                            className="w-44"
                        />
                        <Select
                            options={[
                                { value: '', label: 'All Status' },
                                { value: 'active', label: 'Active' },
                                { value: 'inactive', label: 'Inactive' },
                            ]}
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="w-36"
                        />

                        <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
                            <Filter className="w-4 h-4" />
                            More Filters
                        </Button>
                    </div>

                    {/* Active Filter Pills */}
                    <FilterPills
                        filters={activeFilters}
                        onRemove={handleRemoveFilter}
                        onClearAll={handleClearAllFilters}
                    />
                </div>
            </Card>

            {/* Employee List - Responsive */}
            {isMobile ? (
                /* Mobile: Card List */
                <div className="space-y-3">
                    {filteredEmployees.map((employee) => (
                        <EmployeeCard
                            key={employee.id}
                            employee={employee}
                            onClick={() => handleViewEmployee(employee)}
                        />
                    ))}
                    {filteredEmployees.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-[--color-text-muted]">No employees found</p>
                            <Button variant="secondary" className="mt-4" onClick={handleAddEmployee}>
                                <Plus className="w-4 h-4" />
                                Add First Employee
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                /* Desktop/Tablet: Table */
                <Card padding="none">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b-2 border-[--color-border] bg-[--color-bg-secondary]">
                                    <th scope="col" className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3">
                                        Employee
                                    </th>
                                    <th scope="col" className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3">
                                        Role
                                    </th>
                                    <th scope="col" className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3">
                                        Department
                                    </th>
                                    <th scope="col" className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3">
                                        Monthly Pay
                                    </th>
                                    <th scope="col" className="text-left text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3">
                                        Status
                                    </th>
                                    <th scope="col" className="text-right text-xs font-medium text-[--color-text-muted] uppercase tracking-wider px-4 py-3">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-[--color-border]">
                                {filteredEmployees.map((employee) => (
                                    <tr
                                        key={employee.id}
                                        tabIndex={0}
                                        className="hover:bg-[--color-bg-tertiary] focus-visible:bg-[--color-bg-tertiary] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-focus] transition-colors cursor-pointer"
                                        onClick={() => handleViewEmployee(employee)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleViewEmployee(employee);
                                            }
                                        }}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center text-[--color-accent-gold] font-medium">
                                                    {employee.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-[--color-text-primary]">
                                                        {employee.name}
                                                    </p>
                                                    <p className="text-xs text-[--color-text-muted]">
                                                        Joined {formatDateReadable(employee.joinDate)}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[--color-text-secondary]">
                                            {employee.role}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[--color-text-secondary]">
                                            {employee.department}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium text-[--color-accent-gold]">
                                            {formatCurrency(employee.monthlyPay)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`
                                                    inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                                    ${employee.status === 'active'
                                                        ? 'bg-[--color-success]/10 text-[--color-success]'
                                                        : 'bg-[--color-text-muted]/10 text-[--color-text-muted]'
                                                    }
                                                `}
                                            >
                                                {employee.status === 'active' ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleViewEmployee(employee)}
                                                    className="p-1.5 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-elevated] focus-visible:ring-2 focus-visible:ring-[--color-focus] transition-colors"
                                                    aria-label="View employee"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleEditEmployee(employee)}
                                                    className="p-1.5 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-elevated] focus-visible:ring-2 focus-visible:ring-[--color-focus] transition-colors"
                                                    aria-label="Edit employee"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteEmployee(employee);
                                                    }}
                                                    className="p-1.5 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-danger] hover:bg-[--color-danger]/10 focus-visible:ring-2 focus-visible:ring-[--color-danger] transition-colors"
                                                    aria-label="Delete employee"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {filteredEmployees.length === 0 && (
                            <div className="text-center py-12">
                                <p className="text-[--color-text-muted]">No employees found</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Employee Profile Drawer */}
            <Drawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title="Employee Profile"
                width="lg"
            >
                {selectedEmployee && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center text-2xl text-[--color-accent-gold] font-medium">
                                {selectedEmployee.name.charAt(0)}
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-[--color-text-primary]">
                                    {selectedEmployee.name}
                                </h3>
                                <p className="text-[--color-text-secondary]">{selectedEmployee.role}</p>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-[--color-text-muted] uppercase">Department</p>
                                    <p className="text-sm text-[--color-text-primary] mt-1">{selectedEmployee.department}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[--color-text-muted] uppercase">Status</p>
                                    <p className="text-sm text-[--color-text-primary] mt-1 capitalize">{selectedEmployee.status}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[--color-text-muted] uppercase">Monthly Pay</p>
                                    <p className="text-sm text-[--color-accent-gold] font-medium mt-1">
                                        {formatCurrency(selectedEmployee.monthlyPay)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[--color-text-muted] uppercase">Joined</p>
                                    <p className="text-sm text-[--color-text-primary] mt-1">
                                        {formatDateReadable(selectedEmployee.joinDate)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-[--color-border]">
                            <Button variant="primary" className="flex-1" onClick={() => {
                                setIsDrawerOpen(false);
                                handleEditEmployee(selectedEmployee);
                            }}>
                                <Edit2 className="w-4 h-4" />
                                Edit Details
                            </Button>
                            <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => {
                                    if (selectedEmployee) {
                                        setSelectedEmployeeId(selectedEmployee.id);
                                        navigate('/attendance');
                                    }
                                }}
                            >
                                View Attendance
                            </Button>
                            <Button
                                variant="danger"
                                className="flex-1"
                                onClick={() => handleDeleteEmployee(selectedEmployee)}
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </Button>
                        </div>
                    </div>
                )}
            </Drawer>

            {/* Add/Edit Employee Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                size="lg"
            >
                <EmployeeForm
                    employee={editingEmployee}
                    onSave={handleSaveEmployee}
                    onCancel={() => setIsModalOpen(false)}
                />
            </Modal>
        </div>
    );
}

// Employee Form Schema
const employeeSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    role: z.string().min(2, "Role must be at least 2 characters"),
    department: z.string().min(1, "Department is required"),
    monthlyPay: z.coerce.number().min(1, "Monthly pay must be greater than 0"),
    joinDate: z.string().min(1, "Join date is required"),
    email: z.string().optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

// Employee Form Component
interface EmployeeFormProps {
    employee?: Employee | null;
    onSave: (data: EmployeeFormData) => void;
    onCancel: () => void;
}

function EmployeeForm({ employee, onSave, onCancel }: EmployeeFormProps) {
    const { register, handleSubmit, formState: { errors } } = useForm<EmployeeFormValues>({
        resolver: zodResolver(employeeSchema) as any,
        defaultValues: {
            name: employee?.name || '',
            role: employee?.role || '',
            department: employee?.department || '',
            monthlyPay: employee?.monthlyPay || 0,
            joinDate: employee?.joinDate || new Date().toISOString().split('T')[0],
            email: employee?.email || '',
            phone: employee?.phone || '',
            notes: employee?.notes || '',
        }
    });

    const onSubmit = (data: EmployeeFormValues) => {
        onSave(data as EmployeeFormData);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
            <Input
                label="Full Name"
                error={errors.name?.message}
                {...register('name')}
            />
            <div className="grid grid-cols-2 gap-4">
                <Input
                    label="Role"
                    error={errors.role?.message}
                    {...register('role')}
                />
                <Select
                    label="Department"
                    options={departments}
                    error={errors.department?.message}
                    {...register('department')}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input
                    label="Monthly Pay (₹)"
                    type="number"
                    error={errors.monthlyPay?.message}
                    {...register('monthlyPay')}
                />
                <Input
                    label="Join Date"
                    type="date"
                    error={errors.joinDate?.message}
                    {...register('joinDate')}
                />
            </div>
            <div className="flex gap-3 pt-4">
                <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                    {employee ? 'Save Changes' : 'Add Employee'}
                </Button>
            </div>
        </form>
    );
}
