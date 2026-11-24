import { ChevronRight } from 'lucide-react';
import type { Employee } from '../lib/types';

// ================================
// Employee Card (Mobile)
// Card-based list item for mobile views
// ================================

interface EmployeeCardProps {
    employee: Employee;
    onClick?: () => void;
    showArrow?: boolean;
}

const statusStyles: Record<Employee['status'], string> = {
    ACTIVE: 'bg-[--color-success]/10 text-[--color-success]',
    INACTIVE: 'bg-[--color-text-muted]/10 text-[--color-text-muted]',
    TERMINATED: 'bg-[--color-danger]/10 text-[--color-danger]',
};

export function EmployeeCard({ employee, onClick, showArrow = true }: EmployeeCardProps) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 p-4 bg-[--color-bg-secondary] border border-[--color-border]
                rounded-xl transition-all duration-200 active:scale-[0.98] active:bg-[--color-bg-tertiary]
                hover:border-[--color-border-subtle] text-left min-h-[72px]"
        >
            <div className="w-11 h-11 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center
                text-[--color-accent-gold] text-lg font-semibold flex-shrink-0">
                {employee.firstName.charAt(0)}
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[--color-text-primary] truncate">{employee.fullName}</h3>
                <p className="text-sm text-[--color-text-muted] truncate">
                    {employee.jobTitle} &bull; {employee.department}
                </p>
                <div className="flex items-center justify-between mt-1 gap-2">
                    <span className="text-xs text-[--color-text-secondary] truncate">{employee.email}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles[employee.status]}`}>
                        {employee.status}
                    </span>
                </div>
            </div>

            {showArrow && <ChevronRight className="w-5 h-5 text-[--color-text-muted] flex-shrink-0" />}
        </button>
    );
}
