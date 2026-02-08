import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ================================
// Input Component
// Clean, accessible input fields
// ================================

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, hint, id, type = 'text', ...props }, ref) => {
        const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;

        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="text-sm font-medium text-[--color-text-secondary]"
                    >
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    type={type}
                    className={cn(
                        `
              w-full h-10 px-3
              bg-[--color-bg-tertiary]
              border border-[--color-border]
              rounded-[--radius-md]
              text-[--color-text-primary]
              placeholder:text-[--color-text-muted]
              transition-all duration-[--transition-fast]
              focus:outline-none focus:ring-2 focus:ring-[--color-focus] focus:ring-offset-2 focus:ring-offset-[--color-bg-primary]
              disabled:opacity-50 disabled:cursor-not-allowed
            `,
                        error && 'border-[--color-danger] focus:ring-[--color-danger]',
                        className
                    )}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
                    {...props}
                />
                {error && (
                    <p id={`${inputId}-error`} className="text-sm text-[--color-danger]">
                        {error}
                    </p>
                )}
                {hint && !error && (
                    <p id={`${inputId}-hint`} className="text-sm text-[--color-text-muted]">
                        {hint}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export { Input };
