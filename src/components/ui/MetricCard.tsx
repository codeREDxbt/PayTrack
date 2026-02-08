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
        gold: 'text-[--color-accent-gold]',
        blue: 'text-[--color-accent-blue]',
        success: 'text-[--color-success]',
        warning: 'text-[--color-warning]',
        danger: 'text-[--color-danger]',
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
          p-4
          bg-[--color-bg-secondary]
          border border-[--color-border]
          rounded-[--radius-lg]
          transition-all duration-[--transition-normal]
          hover:border-[--color-border-subtle]
        `,
                className
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-[--color-text-secondary] truncate">{label}</p>
                    <p className={cn('text-2xl font-semibold mt-1', accentColors[accentColor])}>
                        {value}
                    </p>
                    {trend && (
                        <div className={cn('flex items-center gap-1 mt-2 text-xs', getTrendColor())}>
                            {getTrendIcon()}
                            <span>{Math.abs(trend.value)}%</span>
                            <span className="text-[--color-text-muted]">vs last month</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className="p-2 bg-[--color-bg-tertiary] rounded-[--radius-md] text-[--color-text-muted]">
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}
