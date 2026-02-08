import fullLogo from '../assets/Logos/full logo.png';
import iconLogo from '../assets/Logos/paytrack logo.png';

interface LogoProps {
    className?: string;
    showText?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
    sm: {
        height: 'h-8',
        width: 'w-auto'
    },
    md: {
        height: 'h-12', // Was h-10
        width: 'w-auto'
    },
    lg: {
        height: 'h-16', // Was h-12
        width: 'w-auto'
    },
    xl: {
        height: 'h-24', // Was h-16
        width: 'w-auto'
    }
};

export function Logo({ className = '', showText = true, size = 'md' }: LogoProps) {
    const s = sizes[size];

    // Based on filenames:
    // 'full logo.png' likely contains text
    // 'paytrack logo.png' likely contains icon or main logo
    // Using fullLogo when text is requested, and iconLogo when not
    const logoSrc = showText ? fullLogo : iconLogo;

    return (
        <img
            src={logoSrc}
            alt="PayTrack Logo"
            className={`${s.height} ${className} object-contain`}
        />
    );
}
