import { useState } from 'react';
import { Search, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeToggle } from '../ThemeToggle';
import { cn } from '../../lib/utils';

// ================================
// Header Component
// Global search and theme toggle
// ================================

interface HeaderProps {
    sidebarCollapsed?: boolean;
}

export function Header({ sidebarCollapsed = false }: HeaderProps) {
    const { signOut } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    };

    return (
        <header
            className={cn(
                `
          fixed top-0 right-0 z-20 h-16
          bg-[--color-bg-secondary]
          border-b-2 border-[--color-border]
          flex items-center justify-between px-6
          transition-all duration-[--transition-normal]
        `,
                sidebarCollapsed ? 'left-16' : 'left-60'
            )}
        >
            {/* Search */}
            <div className="relative w-full max-w-[120px] sm:max-w-[200px] md:max-w-xs lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--color-text-muted]" />
                <input
                    type="text"
                    placeholder="Search employees, payroll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="
            w-full h-10 pl-10 pr-4
            bg-[--color-bg-tertiary]
            border-2 border-[--color-border]
            rounded-none
            text-sm font-bold tracking-wider text-[--color-text-primary]
            placeholder:text-[--color-text-muted] uppercase
            focus:outline-none focus:border-[--color-focus]
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
                <ThemeToggle />

                {/* User Menu */}
                <div className="ml-2 pl-4 border-l-2 border-[--color-border] flex items-center gap-3">
                    <div className="w-10 h-10 border-2 border-[--color-border] bg-[--color-text-primary] flex items-center justify-center text-[--color-bg-primary] text-sm font-black uppercase shadow-[--shadow-sm]">
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
                        onClick={handleSignOut}
                        aria-label="Sign out"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </header>
    );
}
