import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme();

    const toggleTheme = () => {
        if (resolvedTheme === 'dark') {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    };

    return (
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
    );
}
