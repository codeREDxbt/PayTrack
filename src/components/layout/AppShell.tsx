import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Logo } from '../Logo';
import { ThemeToggle } from '../ThemeToggle';
import { cn } from '../../lib/utils';
import { useBreakpoint } from '../../hooks/useResponsive';

// ================================
// AppShell Component
// Responsive layout wrapper
// ================================

interface AppShellProps {
    children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const breakpoint = useBreakpoint();

    const isMobile = breakpoint === 'mobile';
    const isTablet = breakpoint === 'tablet';
    const isDesktop = breakpoint === 'desktop';

    return (
        <div className="min-h-screen bg-[--color-bg-primary]">
            {/* Skip to content for accessibility */}
            <a
                href="#main-content"
                className="skip-link"
            >
                Skip to main content
            </a>

            {/* Desktop & Tablet: Sidebar */}
            {!isMobile && (
                <Sidebar
                    collapsed={isTablet || sidebarCollapsed}
                    onCollapse={setSidebarCollapsed}
                />
            )}

            {/* Desktop & Tablet: Header */}
            {!isMobile && (
                <Header sidebarCollapsed={isTablet || sidebarCollapsed} />
            )}

            {/* Mobile: Simple header */}
            {isMobile && (
                <header className="fixed top-0 left-0 right-0 z-30 h-16 bg-[--color-bg-secondary] border-b border-[--color-border]">
                    <div className="flex items-center justify-between h-full px-4">
                        <Logo size="md" />
                        <ThemeToggle />
                    </div>
                </header>
            )}

            <main
                id="main-content"
                className={cn(
                    'min-h-screen transition-all duration-[--transition-normal]',
                    // Mobile: no sidebar, header is 64px, bottom nav is 64px
                    isMobile && 'pt-16 pb-20',
                    // Tablet: collapsed sidebar (64px), header is 64px
                    isTablet && 'pt-16 pl-16',
                    // Desktop: full sidebar (240px) or collapsed (64px)
                    isDesktop && (sidebarCollapsed ? 'pt-16 pl-16' : 'pt-16 pl-60')
                )}
            >
                <div
                    className={cn(
                        'mx-auto w-full max-w-[1400px] transition-all duration-[--transition-normal]',
                        // One gutter scale for every page: 16 → 24 → 32px,
                        // with matching vertical rhythm, so headings and table
                        // edges line up across routes and at every width.
                        isMobile ? 'px-4 py-5' : 'px-6 py-6 lg:px-8'
                    )}
                >
                    {children}
                </div>
            </main>

            {/* Mobile: Bottom navigation */}
            {isMobile && <BottomNav />}
        </div>
    );
}
