import { TrendingUp } from 'lucide-react';

interface LogoProps {
    className?: string;
    showText?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
    sm: {
        icon: 'w-8 h-8',
        iconSize: 'w-5 h-5',
        text: 'text-lg',
        gap: 'gap-2',
        radius: 'rounded-lg'
    },
    md: {
        icon: 'w-10 h-10',
        iconSize: 'w-6 h-6',
        text: 'text-xl',
        gap: 'gap-3',
        radius: 'rounded-xl'
    },
    lg: {
        icon: 'w-12 h-12',
        iconSize: 'w-7 h-7',
        text: 'text-2xl',
        gap: 'gap-3',
        radius: 'rounded-2xl'
    },
    xl: {
        icon: 'w-16 h-16',
        iconSize: 'w-9 h-9',
        text: 'text-3xl',
        gap: 'gap-4',
        radius: 'rounded-3xl'
    }
};

export function Logo({ className = '', showText = true, size = 'md' }: LogoProps) {
    const s = sizes[size];

    return (
        <div className={`flex items-center ${s.gap} ${className}`}>
            {/* Icon */}
            <div
                className={`${s.icon} ${s.radius} flex items-center justify-center shadow-lg shadow-[--color-accent-gold]/20 flex-shrink-0`}
                style={{ backgroundColor: '#D8B04C' }}
            >
                <TrendingUp className={`${s.iconSize} text-black stroke-[3]`} />
            </div>

            {/* Text */}
            {showText && (
                <div className="flex flex-col">
                    <h1 className={`${s.text} font-semibold text-[--color-accent-gold] tracking-[0.25em] leading-none text-shadow-sm`}>
                        PAYTRACK
                    </h1>
                </div>
            )}
        </div>
    );
}
