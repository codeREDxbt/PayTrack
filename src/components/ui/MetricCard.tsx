import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ================================
// MetricCard Component
// KPI display for dashboard
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
                `
          p-4 relative
          bg-[--color-bg-secondary]
          border-2 border-[--color-border]
          rounded-[--radius-lg]
          transition-all duration-[--transition-normal]
          hover:shadow-[--shadow-sm] hover:-translate-y-[2px] hover:-translate-x-[2px] hover:border-[--color-text-primary]
        `,
                className
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-[--color-text-secondary] truncate">{label}</p>
                    <p className={cn('text-3xl font-bold mt-2', accentColors[accentColor].split(' ')[0])}>
                        {value}
                    </p>
                    {trend && (
                        <div className={cn('flex items-center gap-1 mt-2 text-xs font-bold', getTrendColor())}>
                            {getTrendIcon()}
                            <span>{Math.abs(trend.value)}%</span>
                            <span className="text-[--color-text-muted] uppercase tracking-wider text-[10px]">vs last month</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className={cn("p-3 border-2 border-[--color-border] rounded-none opacity-80", accentColors[accentColor].split(' ')[1])}>
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}
