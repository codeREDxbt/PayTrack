import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Calculator,
    User,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ================================
// Bottom Navigation (Mobile)
// Clean, minimal bottom nav for mobile
// ================================

interface NavItem {
    path: string;
    icon: React.ElementType;
    label: string;
}

const NAV_ITEMS: NavItem[] = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/people', icon: Users, label: 'People' },
    { path: '/attendance', icon: Calendar, label: 'Time' },
    { path: '/payroll', icon: Calculator, label: 'Payroll' },
    { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 bg-[--color-bg-secondary] border-t-2 border-[--color-border]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `
                            flex flex-col items-center justify-center gap-1
                            min-w-[56px] h-14 px-2
                            rounded-none transition-all duration-300
                            ${isActive
                                ? 'text-[--color-text-primary] border-t-2 border-[--color-text-primary] -translate-y-1'
                                : 'text-[--color-text-muted] opacity-60 hover:opacity-100 hover:-translate-y-0.5 hover:border-t-2 border-transparent'
                            }
                        `}
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon
                                    className={cn(
                                        "w-5 h-5",
                                        isActive && "stroke-[2.5px]"
                                    )}
                                />
                                <span className={cn(
                                    "text-[10px] font-black uppercase tracking-widest",
                                    isActive ? "text-[--color-text-primary]" : "text-current"
                                )}>
                                    {item.label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
