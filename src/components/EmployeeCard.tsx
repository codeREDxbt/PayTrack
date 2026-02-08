import { ChevronRight } from 'lucide-react';
import type { Employee } from '../lib/types';
import { formatCurrency } from '../utils/salaryCalculator';

// ================================
// Employee Card (Mobile)
// Card-based list item for mobile views
// ================================

interface EmployeeCardProps {
    employee: Employee;
    onClick?: () => void;
    showArrow?: boolean;
}

const statusColors = {
    active: {
        bg: 'bg-[--color-success]/10',
        text: 'text-[--color-success]',
        dot: 'bg-[--color-success]',
    },
    inactive: {
        bg: 'bg-[--color-text-muted]/10',
        text: 'text-[--color-text-muted]',
        dot: 'bg-[--color-text-muted]',
    },
    onLeave: {
        bg: 'bg-[--color-warning]/10',
        text: 'text-[--color-warning]',
        dot: 'bg-[--color-warning]',
    },
};

export function EmployeeCard({ employee, onClick, showArrow = true }: EmployeeCardProps) {
    const statusStyle = statusColors[employee.status] || statusColors.inactive;

    return (
        <button
            onClick={onClick}
            className="
        w-full flex items-center gap-3 p-4
        bg-[--color-bg-secondary] 
        border border-[--color-border]
        rounded-xl
        transition-all duration-200
        active:scale-[0.98] active:bg-[--color-bg-tertiary]
        hover:border-[--color-border-subtle]
        text-left
        min-h-[72px]
      "
        >
            {/* Avatar */}
            <div className="
        w-11 h-11 rounded-full 
        bg-[--color-accent-gold]/20 
        flex items-center justify-center 
        text-[--color-accent-gold] 
        text-lg font-semibold
        flex-shrink-0
      ">
                {employee.name.charAt(0)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[--color-text-primary] truncate">
                        {employee.name}
                    </h3>
                </div>
                <p className="text-sm text-[--color-text-muted] truncate">
                    {employee.role} • {employee.department}
                </p>
                <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-medium text-[--color-text-secondary]">
                        {formatCurrency(employee.monthlyPay)}/mo
                    </span>
                    <span className={`
            inline-flex items-center gap-1 px-2 py-0.5 
            rounded-full text-xs font-medium
            ${statusStyle.bg} ${statusStyle.text}
          `}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                        {employee.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>

            {/* Arrow */}
            {showArrow && (
                <ChevronRight className="w-5 h-5 text-[--color-text-muted] flex-shrink-0" />
            )}
        </button>
    );
}

// Skeleton version for loading states
export function EmployeeCardSkeleton() {
    return (
        <div className="
      w-full flex items-center gap-3 p-4
      bg-[--color-bg-secondary] 
      border border-[--color-border]
      rounded-xl
      animate-pulse
      min-h-[72px]
    ">
            {/* Avatar skeleton */}
            <div className="w-11 h-11 rounded-full bg-[--color-bg-tertiary]" />

            {/* Content skeleton */}
            <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-[--color-bg-tertiary] rounded" />
                <div className="h-3 w-48 bg-[--color-bg-tertiary] rounded" />
                <div className="flex items-center justify-between">
                    <div className="h-3 w-20 bg-[--color-bg-tertiary] rounded" />
                    <div className="h-5 w-16 bg-[--color-bg-tertiary] rounded-full" />
                </div>
            </div>

            {/* Arrow skeleton */}
            <div className="w-5 h-5 bg-[--color-bg-tertiary] rounded" />
        </div>
    );
}
