import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ================================
// Button Component
// Premium CRED-inspired styling
// ================================

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
        const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-medium rounded-[--radius-md]
      transition-all duration-[--transition-fast]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-focus] focus-visible:ring-offset-2 focus-visible:ring-offset-black
      disabled:pointer-events-none disabled:opacity-50
    `;

        const variants = {
            primary: `
        bg-[--color-accent-gold] text-[--color-text-inverse]
        hover:bg-[--color-accent-gold-hover]
        active:scale-[0.98]
        shadow-[0_2px_10px_rgba(216,176,76,0.2)]
      `,
            secondary: `
        bg-[--color-bg-tertiary] text-[--color-text-primary]
        border border-[--color-border]
        hover:bg-[--color-bg-elevated] hover:border-[--color-border-subtle]
      `,
            ghost: `
        bg-transparent text-[--color-text-secondary]
        hover:bg-[--color-bg-tertiary] hover:text-[--color-text-primary]
      `,
            danger: `
        bg-[--color-danger] text-white
        hover:bg-[#EF5350]
        active:scale-[0.98]
      `,
        };

        const sizes = {
            sm: 'h-8 px-3 text-sm',
            md: 'h-10 px-4 text-sm',
            lg: 'h-12 px-6 text-base',
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variants[variant], sizes[size], className)}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && (
                    <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                )}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';

export { Button };
