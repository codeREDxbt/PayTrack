import { useState } from 'react';
import { Search, Sun, Moon, Bell, LogOut } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';

// ================================
// Header Component
// Global search and theme toggle
// ================================

interface HeaderProps {
    sidebarCollapsed?: boolean;
}

export function Header({ sidebarCollapsed = false }: HeaderProps) {
    const { setTheme, resolvedTheme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');

    const toggleTheme = () => {
        if (resolvedTheme === 'dark') {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    };

    return (
        <header
            className={cn(
                `
          fixed top-0 right-0 z-20 h-16
          bg-[--color-bg-secondary]/80
          backdrop-blur-md
          border-b border-[--color-border]
          flex items-center justify-between px-6
          transition-all duration-[--transition-normal]
        `,
                sidebarCollapsed ? 'left-16' : 'left-60'
            )}
        >
            {/* Search */}
            <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--color-text-muted]" />
                <input
                    type="text"
                    placeholder="Search employees, payroll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="
            w-full h-9 pl-10 pr-4
            bg-[--color-bg-tertiary]
            border border-[--color-border]
            rounded-[--radius-md]
            text-sm text-[--color-text-primary]
            placeholder:text-[--color-text-muted]
            focus:outline-none focus:ring-2 focus:ring-[--color-focus] focus:ring-offset-2 focus:ring-offset-[--color-bg-secondary]
            transition-all duration-[--transition-fast]
          "
                />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                {/* Notifications */}
                <button
                    className="
            relative p-2
            rounded-[--radius-md]
            text-[--color-text-muted]
            hover:text-[--color-text-primary]
            hover:bg-[--color-bg-tertiary]
            transition-colors
          "
                    aria-label="Notifications"
                >
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-[--color-danger] rounded-full" />
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="
            p-2
            rounded-[--radius-md]
            text-[--color-text-muted]
            hover:text-[--color-text-primary]
            hover:bg-[--color-bg-tertiary]
            transition-colors
          "
                    aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {resolvedTheme === 'dark' ? (
                        <Sun className="w-5 h-5" />
                    ) : (
                        <Moon className="w-5 h-5" />
                    )}
                </button>

                {/* User Menu */}
                <div className="ml-2 pl-4 border-l border-[--color-border] flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[--color-accent-gold] flex items-center justify-center text-[--color-text-inverse] text-sm font-medium">
                        A
                    </div>
                    <button
                        className="
              p-2
              rounded-[--radius-md]
              text-[--color-text-muted]
              hover:text-[--color-danger]
              hover:bg-[--color-danger-muted]
              transition-colors
            "
                        aria-label="Sign out"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </header>
    );
}
