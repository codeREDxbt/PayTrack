import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ================================
// Card Component
// Premium dark surface cards
// ================================

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'elevated' | 'glass';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant = 'default', padding = 'md', children, ...props }, ref) => {
        const baseStyles = 'rounded-[--radius-lg] transition-all duration-[--transition-normal] border-2';

        const variants = {
            default: `
        bg-[--color-bg-secondary]
        border-[--color-border]
      `,
            elevated: `
        bg-[--color-bg-tertiary]
        border-[--color-border]
        shadow-[--shadow-md]
        hover:shadow-[--shadow-lg] hover:translate-x-[-2px] hover:translate-y-[-2px]
      `,
            glass: `
        glass
      `,
        };

        const paddings = {
            none: '',
            sm: 'p-3',
            md: 'p-4',
            lg: 'p-6',
        };

        return (
            <div
                ref={ref}
                className={cn(baseStyles, variants[variant], paddings[padding], className)}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = 'Card';

// Card Header
const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('flex flex-col gap-1.5 pb-4', className)}
            {...props}
        />
    )
);
CardHeader.displayName = 'CardHeader';

// Card Title
const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
    ({ className, ...props }, ref) => (
        <h3
            ref={ref}
            className={cn('text-lg font-bold uppercase tracking-wider text-[--color-text-primary]', className)}
            {...props}
        />
    )
);
CardTitle.displayName = 'CardTitle';

// Card Description
const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
    ({ className, ...props }, ref) => (
        <p
            ref={ref}
            className={cn('text-sm text-[--color-text-secondary]', className)}
            {...props}
        />
    )
);
CardDescription.displayName = 'CardDescription';

// Card Content
const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('', className)} {...props} />
    )
);
CardContent.displayName = 'CardContent';

// Card Footer
const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('flex items-center gap-2 pt-4 border-t-2 border-[--color-border]', className)}
            {...props}
        />
    )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
