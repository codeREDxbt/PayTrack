import { useState, useRef, useEffect } from 'react';
import { Search, Bell, LogOut, User, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
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
    const { user, signOut } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    const handleSignOut = async () => {
        try {
            await signOut();
            setIsMenuOpen(false);
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
                <div className="ml-2 pl-4 border-l-2 border-[--color-border] flex items-center gap-3 relative" ref={menuRef}>
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="w-10 h-10 border-2 border-[--color-border] bg-[--color-text-primary] flex items-center justify-center text-[--color-bg-primary] text-sm font-black uppercase transition-all duration-[--transition-fast] focus:outline-none focus:border-[--color-focus] hover:shadow-[--shadow-sm] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
                    >
                        {user?.displayName ? user.displayName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'A'}
                    </button>

                    {/* Dropdown Menu */}
                    {isMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+0.5rem)] w-56 bg-[--color-bg-secondary] border-2 border-[--color-border] shadow-[--shadow-md] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* User Info Header */}
                            <div className="px-4 py-3 border-b-2 border-[--color-border] bg-[--color-bg-tertiary]">
                                <p className="text-sm font-bold text-[--color-text-primary] truncate">{user?.displayName || 'User'}</p>
                                <p className="text-xs text-[--color-text-secondary] truncate">{user?.email}</p>
                            </div>

                            {/* Actions */}
                            <div className="py-1">
                                <Link
                                    to="/profile"
                                    onClick={() => setIsMenuOpen(false)}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold uppercase tracking-wider text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                                >
                                    <User className="w-4 h-4" />
                                    Profile
                                </Link>
                                <Link
                                    to="/settings"
                                    onClick={() => setIsMenuOpen(false)}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold uppercase tracking-wider text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg-tertiary] transition-colors"
                                >
                                    <Settings className="w-4 h-4" />
                                    Settings
                                </Link>
                                <div className="border-t border-[--color-border] my-1" />
                                <button
                                    onClick={handleSignOut}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-bold uppercase tracking-wider text-[--color-danger] hover:bg-[--color-danger]/10 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
