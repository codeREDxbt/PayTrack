import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Wallet,
    Settings,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { Logo } from '../Logo';
import { cn } from '../../lib/utils';

// ================================
// Sidebar Component
// Collapsible navigation for tablet/desktop
// ================================

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/people', icon: Users, label: 'People' },
    { path: '/attendance', icon: Calendar, label: 'Time & Leave' },
    { path: '/payroll', icon: Wallet, label: 'Payroll' },
    { path: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
    collapsed?: boolean;
    onCollapse?: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed = false, onCollapse }: SidebarProps) {
    const location = useLocation();

    const handleToggle = () => {
        onCollapse?.(!collapsed);
    };

    return (
        <aside
            className={cn(
                `
          fixed left-0 top-0 z-30 h-screen
          bg-[--color-bg-secondary]
          border-r border-[--color-border]
          transition-all duration-[--transition-normal]
          flex flex-col
        `,
                collapsed ? 'w-16' : 'w-60'
            )}
        >
            {/* Logo Area */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-[--color-border]">
                {!collapsed && (
                    <div className="px-2">
                        <Logo size="lg" />
                    </div>
                )}
                {onCollapse && (
                    <button
                        onClick={handleToggle}
                        className="p-1.5 rounded-[--radius-md] text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? (
                            <ChevronRight className="w-5 h-5" />
                        ) : (
                            <ChevronLeft className="w-5 h-5" />
                        )}
                    </button>
                )}
                {!onCollapse && collapsed && (
                    <span className="text-lg font-bold text-[--color-accent-gold]">P</span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-2 overflow-y-auto">
                <ul className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        const Icon = item.icon;

                        return (
                            <li key={item.path}>
                                <NavLink
                                    to={item.path}
                                    className={cn(
                                        `
                      flex items-center gap-3 px-3 py-2.5
                      rounded-[--radius-md]
                      text-sm font-medium
                      transition-all duration-[--transition-fast]
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-focus]
                    `,
                                        isActive
                                            ? 'bg-[--color-accent-gold]/10 text-[--color-accent-gold]'
                                            : 'text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary]',
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

            {/* Footer */}
            {!collapsed && (
                <div className="p-4 border-t border-[--color-border]">
                    <p className="text-xs text-[--color-text-muted]">
                        Salary Tracker v1.2
                    </p>
                </div>
            )}
        </aside>
    );
}
