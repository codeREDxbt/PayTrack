import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ================================
// MetricCard Component
// KPI display for dashboard
// The value uses a clamped font size so long currency strings
// (₹11,33,930.36) never force a horizontal scrollbar in the 2-column
// mobile grid, and the icon sits out of the text flow so the label and
// value always get the full card width.
// ================================

export interface MetricCardProps {
    label: string;
    value: string | number;
    trend?: {
        value: number;
        isPositive?: boolean;
    };
    icon?: ReactNode;
    accentColor?: 'gold' | 'blue' | 'success' | 'warning' | 'danger';
    className?: string;
}

export function MetricCard({
    label,
    value,
    trend,
    icon,
    accentColor = 'gold',
    className,
}: MetricCardProps) {
    const accentColors = {
        gold: 'text-[--color-accent-gold] bg-[--color-text-primary]/5',
        blue: 'text-[--color-accent-blue] bg-[--color-text-primary]/5',
        success: 'text-[--color-success] bg-[--color-text-primary]/5',
        warning: 'text-[--color-warning] bg-[--color-text-primary]/5',
        danger: 'text-[--color-danger] bg-[--color-text-primary]/5',
    };

    const getTrendIcon = () => {
        if (!trend) return null;
        if (trend.value > 0) return <TrendingUp className="w-3 h-3" />;
        if (trend.value < 0) return <TrendingDown className="w-3 h-3" />;
        return <Minus className="w-3 h-3" />;
    };

    const getTrendColor = () => {
        if (!trend) return '';
        if (trend.isPositive !== undefined) {
            return trend.isPositive ? 'text-[--color-success]' : 'text-[--color-danger]';
        }
        return trend.value >= 0 ? 'text-[--color-success]' : 'text-[--color-danger]';
    };

    return (
        <div
            className={cn(
                `group relative flex h-full min-w-0 flex-col
          p-4
          bg-[--color-bg-secondary]
          border-2 border-[--color-border]
          rounded-[--radius-lg]
          transition-all duration-[--transition-normal]
          hover:shadow-[--shadow-sm] hover:-translate-y-[2px] hover:-translate-x-[2px] hover:border-[--color-text-primary]
        `,
                className
            )}
        >
            {icon && (
                <div
                    className={cn(
                        'absolute right-3 top-3 flex h-8 w-8 items-center justify-center border-2 border-[--color-border] opacity-80 [&>svg]:h-4 [&>svg]:w-4',
                        accentColors[accentColor].split(' ')[1]
                    )}
                    aria-hidden="true"
                >
                    {icon}
                </div>
            )}

            <p className="min-h-[2.4em] pr-12 text-[10px] font-bold uppercase leading-snug tracking-[0.14em] text-[--color-text-secondary] sm:text-[11px]">
                {label}
            </p>

            <p
                className={cn(
                    'mt-1 break-words text-[clamp(1.05rem,4.6vw,1.75rem)] font-bold leading-none tracking-tight tabular-nums',
                    accentColors[accentColor].split(' ')[0]
                )}
            >
                {value}
            </p>

            {trend && (
                <div className={cn('mt-3 flex flex-wrap items-center gap-1 text-xs font-bold', getTrendColor())}>
                    {getTrendIcon()}
                    <span>{Math.abs(trend.value)}%</span>
                    <span className="text-[10px] uppercase tracking-wider text-[--color-text-muted]">vs last month</span>
                </div>
            )}
        </div>
    );
}
