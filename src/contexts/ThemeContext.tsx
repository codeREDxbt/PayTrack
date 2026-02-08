import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// ================================
// Theme Context
// Dark/Light mode with system preference
// ================================

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: 'dark' | 'light';
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'salary-tracker-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'dark';
        return (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark';
    });

    const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');

    // Resolve system theme
    useEffect(() => {
        const updateResolvedTheme = () => {
            if (theme === 'system') {
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                setResolvedTheme(systemDark ? 'dark' : 'light');
            } else {
                setResolvedTheme(theme);
            }
        };

        updateResolvedTheme();

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', updateResolvedTheme);

        return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
    }, [theme]);

    // Apply theme class to document
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('dark', 'light');
        root.classList.add(resolvedTheme);

        // Update CSS variables for light mode
        if (resolvedTheme === 'light') {
            root.style.setProperty('--color-bg-primary', '#FAFAFA');
            root.style.setProperty('--color-bg-secondary', '#FFFFFF');
            root.style.setProperty('--color-bg-tertiary', '#F5F5F5');
            root.style.setProperty('--color-bg-elevated', '#FFFFFF');
            root.style.setProperty('--color-border', '#E5E5E5');
            root.style.setProperty('--color-border-subtle', '#D4D4D4');
            root.style.setProperty('--color-text-primary', '#0F0F10');
            root.style.setProperty('--color-text-secondary', '#525252');
            root.style.setProperty('--color-text-muted', '#737373');
            root.style.setProperty('--color-text-inverse', '#F5F6F7');
            root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.85)');
            root.style.setProperty('--glass-border', 'rgba(0, 0, 0, 0.08)');

            // Adjust accents for light mode contrast
            root.style.setProperty('--color-accent-gold', '#B7860B'); // Darker gold for light mode
            root.style.setProperty('--color-accent-gold-hover', '#D2691E');
            root.style.setProperty('--color-text-inverse', '#FFFFFF'); // Ensure inverse text is white
        } else {
            // Reset to dark mode defaults
            root.style.setProperty('--color-bg-primary', '#0F0F10');
            root.style.setProperty('--color-bg-secondary', '#16171A');
            root.style.setProperty('--color-bg-tertiary', '#1E2025');
            root.style.setProperty('--color-bg-elevated', '#25272D');
            root.style.setProperty('--color-border', '#2A2D34');
            root.style.setProperty('--color-border-subtle', '#1E2025');
            root.style.setProperty('--color-text-primary', '#F5F6F7');
            root.style.setProperty('--color-text-secondary', '#A9AFBC');
            root.style.setProperty('--color-text-muted', '#6B7280');
            root.style.setProperty('--color-text-inverse', '#0F0F10');
            root.style.setProperty('--glass-bg', 'rgba(22, 23, 26, 0.85)');
            root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.08)');

            // Reset accents
            root.style.setProperty('--color-accent-gold', '#D8B04C');
            root.style.setProperty('--color-accent-gold-hover', '#E5C15F');
            root.style.setProperty('--color-text-inverse', '#0F0F10');
        }
    }, [resolvedTheme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(STORAGE_KEY, newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
