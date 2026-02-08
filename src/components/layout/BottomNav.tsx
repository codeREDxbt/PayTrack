import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Calculator,
    MoreHorizontal,
    Settings,
    FileText,
    X,
} from 'lucide-react';
import { useState } from 'react';

// ================================
// Bottom Navigation (Mobile)
// Task-first navigation for mobile devices
// ================================

interface NavItem {
    path: string;
    icon: React.ElementType;
    label: string;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/people', icon: Users, label: 'People' },
    { path: '/attendance', icon: Calendar, label: 'Time' },
    { path: '/payroll', icon: Calculator, label: 'Payroll' },
];

const MORE_NAV_ITEMS: NavItem[] = [
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/documents', icon: FileText, label: 'Documents' },
];

export function BottomNav() {
    const [showMore, setShowMore] = useState(false);

    return (
        <>
            {/* More Menu Overlay */}
            {showMore && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowMore(false)}
                />
            )}

            {/* More Menu Sheet */}
            <div
                className={`
          fixed bottom-16 left-0 right-0 z-50
          bg-[--color-bg-secondary] border-t border-[--color-border]
          rounded-t-2xl shadow-2xl
          transition-transform duration-300 ease-out
          ${showMore ? 'translate-y-0' : 'translate-y-full'}
        `}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-[--color-text-secondary]">
                            More Options
                        </span>
                        <button
                            onClick={() => setShowMore(false)}
                            className="p-1 rounded-full hover:bg-[--color-bg-tertiary] transition-colors"
                            aria-label="Close menu"
                        >
                            <X className="w-5 h-5 text-[--color-text-muted]" />
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        {MORE_NAV_ITEMS.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => setShowMore(false)}
                                className={({ isActive }) => `
                  flex flex-col items-center gap-1.5 p-3
                  rounded-xl transition-all
                  min-h-[64px] min-w-[64px]
                  ${isActive
                                        ? 'bg-[--color-accent-gold]/10 text-[--color-accent-gold]'
                                        : 'text-[--color-text-secondary] hover:bg-[--color-bg-tertiary]'
                                    }
                `}
                            >
                                <item.icon className="w-6 h-6" />
                                <span className="text-xs font-medium">{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Navigation Bar */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-40 bg-[--color-bg-secondary] border-t border-[--color-border]"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="flex items-center justify-around h-16">
                    {PRIMARY_NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `
                flex flex-col items-center justify-center gap-0.5
                w-16 h-12 rounded-xl
                transition-all duration-200
                ${isActive
                                    ? 'text-[--color-accent-gold]'
                                    : 'text-[--color-text-muted] active:scale-95'
                                }
              `}
                        >
                            {({ isActive }) => (
                                <>
                                    <item.icon
                                        className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`}
                                        strokeWidth={isActive ? 2.5 : 2}
                                    />
                                    <span className="text-[10px] font-medium">{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}

                    {/* More Button */}
                    <button
                        onClick={() => setShowMore(!showMore)}
                        className={`
              flex flex-col items-center justify-center gap-0.5
              w-16 h-12 rounded-xl
              transition-all duration-200
              ${showMore
                                ? 'text-[--color-accent-gold]'
                                : 'text-[--color-text-muted] active:scale-95'
                            }
            `}
                    >
                        <MoreHorizontal
                            className={`w-6 h-6 transition-transform ${showMore ? 'rotate-90' : ''}`}
                        />
                        <span className="text-[10px] font-medium">More</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
