import { useEffect, useState } from 'react';

// ================================
// Responsive Hooks
// Custom hooks for responsive breakpoints
// ================================

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const BREAKPOINTS = {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
} as const;

/**
 * Hook to detect current breakpoint
 * Returns: 'mobile' | 'tablet' | 'desktop'
 */
export function useBreakpoint(): Breakpoint {
    const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');

    useEffect(() => {
        const getBreakpoint = (): Breakpoint => {
            const width = window.innerWidth;
            if (width < BREAKPOINTS.tablet) return 'mobile';
            if (width < BREAKPOINTS.desktop) return 'tablet';
            return 'desktop';
        };

        // Set initial value
        setBreakpoint(getBreakpoint());

        // Update on resize
        const handleResize = () => {
            setBreakpoint(getBreakpoint());
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return breakpoint;
}

/**
 * Hook to check if current viewport is mobile
 */
export function useIsMobile(): boolean {
    const breakpoint = useBreakpoint();
    return breakpoint === 'mobile';
}

/**
 * Hook to check if current viewport is tablet or smaller
 */
export function useIsTabletOrSmaller(): boolean {
    const breakpoint = useBreakpoint();
    return breakpoint === 'mobile' || breakpoint === 'tablet';
}

/**
 * Hook to check if current viewport is desktop
 */
export function useIsDesktop(): boolean {
    const breakpoint = useBreakpoint();
    return breakpoint === 'desktop';
}

/**
 * Hook to get responsive value based on breakpoint
 */
export function useResponsiveValue<T>(values: {
    mobile: T;
    tablet?: T;
    desktop?: T;
}): T {
    const breakpoint = useBreakpoint();

    if (breakpoint === 'mobile') return values.mobile;
    if (breakpoint === 'tablet') return values.tablet ?? values.mobile;
    return values.desktop ?? values.tablet ?? values.mobile;
}
