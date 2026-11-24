import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Wallet,
    Settings,
    ChevronLeft,
    ChevronRight,
    BarChart3,
    User,
} from 'lucide-react';
import { Logo } from '../Logo';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

// ================================
// Sidebar Component
// Collapsible navigation for tablet/desktop, filtered by the signed-in role.
// ================================

const STAFF_NAV = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/people', icon: Users, label: 'People' },
    { path: '/attendance', icon: Calendar, label: 'Time & Leave' },
    { path: '/payroll', icon: Wallet, label: 'Payroll' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
    { path: '/settings', icon: Settings, label: 'Settings' },
];

const EMPLOYEE_NAV = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/attendance', icon: Calendar, label: 'My Attendance' },
    { path: '/payroll', icon: Wallet, label: 'My Payroll' },
    { path: '/profile', icon: User, label: 'Profile' },
    { path: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
    collapsed?: boolean;
    onCollapse?: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed = false, onCollapse }: SidebarProps) {
    const location = useLocation();
    const { user } = useAuth();
    const navItems = useMemo(() => (user?.isStaff ? STAFF_NAV : EMPLOYEE_NAV), [user?.isStaff]);

    return (
        <aside
            className={cn(
                `fixed left-0 top-0 z-30 h-screen
                 bg-[--color-bg-secondary]
                 border-r-2 border-[--color-border]
                 transition-all duration-[--transition-normal]
                 flex flex-col`,
                collapsed ? 'w-16' : 'w-60'
            )}
        >
            <div className="h-24 flex items-center justify-between px-4 border-b-2 border-[--color-border]">
                {!collapsed && (
                    <div className="px-2">
                        <Logo size="lg" />
                    </div>
                )}
                {onCollapse && (
                    <button
                        onClick={() => onCollapse(!collapsed)}
                        className="p-1.5 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                    </button>
                )}
            </div>

            <nav className="flex-1 py-4 px-2 overflow-y-auto">
                <ul className="space-y-1">
                    {navItems.map((item) => {
                        const isActive =
                            item.path === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(item.path);
                        const Icon = item.icon;
                        return (
                            <li key={item.path}>
                                <NavLink
                                    to={item.path}
                                    className={cn(
                                        `flex items-center gap-3 px-3 py-2.5
                                         border-2 border-transparent
                                         text-sm font-bold uppercase tracking-wider
                                         transition-all duration-[--transition-fast]
                                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-focus]`,
                                        isActive
                                            ? 'bg-[--color-text-primary] text-[--color-bg-primary] border-[--color-text-primary] shadow-[--shadow-sm] translate-x-1'
                                            : 'text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] hover:border-[--color-border]',
                                        collapsed && 'justify-center'
                                    )}
                                    aria-current={isActive ? 'page' : undefined}
                                    title={collapsed ? item.label : undefined}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                    {!collapsed && <span>{item.label}</span>}
                                </NavLink>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {!collapsed && (
                <div className="p-4 border-t-2 border-[--color-border] bg-[--color-bg-tertiary]">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[--color-text-primary]">
                        {user?.isStaff ? 'STAFF CONSOLE' : 'EMPLOYEE PORTAL'}
                    </p>
                    <p className="text-[9px] text-[--color-text-muted]/70 mt-1 uppercase tracking-widest">
                        {user?.systemRole} &bull; PayTrack
                    </p>
                </div>
            )}
        </aside>
    );
}
