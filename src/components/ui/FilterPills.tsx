import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

// ================================
// FilterPills Component
// Lozenge-style additive filters
// ================================

export interface FilterPill {
    id: string;
    label: string;
    value: string;
}

export interface FilterPillsProps {
    filters: FilterPill[];
    onRemove: (id: string) => void;
    onClearAll?: () => void;
    className?: string;
}

export function FilterPills({
    filters,
    onRemove,
    onClearAll,
    className,
}: FilterPillsProps) {
    if (filters.length === 0) return null;

    return (
        <div className={cn('flex flex-wrap items-center gap-2', className)}>
            {filters.map((filter) => (
                <div
                    key={filter.id}
                    className="
            inline-flex items-center gap-1.5 px-2.5 py-1
            bg-[--color-accent-blue]/10
            border border-[--color-accent-blue]/30
            rounded-full
            text-sm text-[--color-accent-blue]
          "
                >
                    <span className="text-[--color-text-muted] text-xs">{filter.label}:</span>
                    <span className="font-medium">{filter.value}</span>
                    <button
                        onClick={() => onRemove(filter.id)}
                        className="p-0.5 hover:bg-[--color-accent-blue]/20 rounded-full transition-colors"
                        aria-label={`Remove ${filter.label} filter`}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ))}

            {onClearAll && filters.length > 1 && (
                <button
                    onClick={onClearAll}
                    className="text-sm text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors"
                >
                    Clear all
                </button>
            )}
        </div>
    );
}
