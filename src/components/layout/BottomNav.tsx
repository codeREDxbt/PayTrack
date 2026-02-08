import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Calculator,
    User,
    Settings,
} from 'lucide-react';

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
    { path: '/settings', icon: Settings, label: 'Settings' },
];

export function BottomNav() {
    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 bg-[--color-bg-secondary] border-t border-[--color-border] safe-area-bottom"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="flex items-center justify-around h-16">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `
                            flex flex-col items-center justify-center gap-1
                            min-w-[56px] h-14 px-2
                            rounded-xl transition-colors
                            ${isActive
                                ? 'text-[--color-accent-gold]'
                                : 'text-[--color-text-muted] active:text-[--color-text-primary]'
                            }
                        `}
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon
                                    className="w-5 h-5"
                                    strokeWidth={isActive ? 2.5 : 2}
                                />
                                <span className="text-[10px] font-medium leading-none">
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
