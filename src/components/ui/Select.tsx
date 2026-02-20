import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

// ================================
// Select Component
// Styled dropdown select
// ================================

export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
    label?: string;
    options: SelectOption[];
    placeholder?: string;
    error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, label, options, placeholder, error, id, ...props }, ref) => {
        const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label
                        htmlFor={selectId}
                        className="text-sm font-bold uppercase tracking-widest text-[--color-text-secondary]"
                    >
                        {label}
                    </label>
                )}
                <div className="relative">
                    <select
                        ref={ref}
                        id={selectId}
                        className={cn(
                            `
                w-full h-10 px-3 pr-10
                appearance-none
                bg-[--color-bg-tertiary]
                border-2 border-[--color-border]
                rounded-[--radius-md]
                text-[--color-text-primary] font-medium
                transition-all duration-[--transition-fast]
                focus:outline-none focus:border-[--color-focus] hover:border-[--color-text-primary]
                disabled:opacity-50 disabled:cursor-not-allowed
                cursor-pointer
              `,
                            error && 'border-[--color-danger]',
                            className
                        )}
                        aria-invalid={!!error}
                        {...props}
                    >
                        {placeholder && (
                            <option value="" disabled style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>
                                {placeholder}
                            </option>
                        )}
                        {options.map((option) => (
                            <option
                                key={option.value}
                                value={option.value}
                                className="bg-[#1e293b] text-slate-200"
                            >
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--color-text-muted] pointer-events-none" />
                </div>
                {error && (
                    <p className="text-sm text-[--color-danger]">{error}</p>
                )}
            </div>
        );
    }
);

Select.displayName = 'Select';

export { Select };
