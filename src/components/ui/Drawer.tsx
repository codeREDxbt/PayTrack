import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

// ================================
// Drawer Component
// Right-side slide-out panel
// ================================

export interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    width?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function Drawer({
    isOpen,
    onClose,
    title,
    children,
    width = 'md',
    className,
}: DrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    const widths = {
        sm: 'w-80',
        md: 'w-96',
        lg: 'w-[480px]',
    };

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Focus trap and restoration
    useEffect(() => {
        if (isOpen) {
            previousActiveElement.current = document.activeElement as HTMLElement;
            drawerRef.current?.focus();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            previousActiveElement.current?.focus();
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer */}
            <div
                ref={drawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? 'drawer-title' : undefined}
                className={cn(
                    `
            fixed top-0 right-0 z-50 h-full
            glass
            border-l border-[--glass-border]
            shadow-[--shadow-xl]
            transition-transform duration-300 ease-out
            flex flex-col
          `,
                    widths[width],
                    isOpen ? 'translate-x-0' : 'translate-x-full',
                    className
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[--color-border] shrink-0">
                    <h2 id="drawer-title" className="text-lg font-semibold text-[--color-text-primary]">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                        aria-label="Close drawer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4">{children}</div>
            </div>
        </>
    );
}
