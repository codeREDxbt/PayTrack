import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

// ================================
// Auth Context
// Firebase Google authentication with rate limiting and error sanitization
// ================================

// ── Rate limiting constants ──────────────────────
const MAX_SIGN_IN_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 30_000; // 30 seconds

// ── Friendly error mapper ────────────────────────
function toFriendlyError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code ?? '';

    const map: Record<string, string> = {
        'auth/popup-blocked': 'Popup was blocked. Please allow popups for this site and try again.',
        'auth/popup-closed-by-user': '', // Not an error — user dismissed
        'auth/cancelled-popup-request': '', // Not an error
        'auth/network-request-failed': 'Network error. Please check your connection and try again.',
        'auth/too-many-requests': 'Too many sign-in attempts. Please wait a moment and try again.',
        'auth/user-disabled': 'This account has been disabled. Contact support.',
        'auth/account-exists-with-different-credential':
            'An account already exists with this email using a different sign-in method.',
    };

    if (code in map) return map[code];

    // Generic fallback — never expose raw SDK messages to users
    console.error('[Auth error]', message);
    return 'Sign in failed. Please try again.';
}

// ── Context type ─────────────────────────────────
interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    rateLimited: boolean;
    rateLimitSecondsLeft: number;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState(0);

    // Rate limiting refs (mutable, no render needed)
    const attemptCount = useRef(0);
    const rateLimitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Listen for auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (rateLimitTimer.current) clearTimeout(rateLimitTimer.current);
            if (countdownTimer.current) clearInterval(countdownTimer.current);
        };
    }, []);

    const startRateLimit = () => {
        setRateLimited(true);
        setRateLimitSecondsLeft(RATE_LIMIT_WINDOW_MS / 1000);

        countdownTimer.current = setInterval(() => {
            setRateLimitSecondsLeft(prev => {
                if (prev <= 1) {
                    if (countdownTimer.current) clearInterval(countdownTimer.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        rateLimitTimer.current = setTimeout(() => {
            attemptCount.current = 0;
            setRateLimited(false);
            setRateLimitSecondsLeft(0);
        }, RATE_LIMIT_WINDOW_MS);
    };

    const signInWithGoogle = async () => {
        if (rateLimited) return;

        setError(null);
        setLoading(true);
        attemptCount.current += 1;

        try {
            await signInWithPopup(auth, googleProvider);
            // Reset on success
            attemptCount.current = 0;
        } catch (err: unknown) {
            const friendlyMessage = toFriendlyError(err);

            if (!friendlyMessage) {
                // User dismissed the popup — not an error
                setLoading(false);
                return;
            }

            setError(friendlyMessage);
            setLoading(false);

            // Apply rate limit after MAX_SIGN_IN_ATTEMPTS failures
            if (attemptCount.current >= MAX_SIGN_IN_ATTEMPTS) {
                startRateLimit();
            }
        }
    };

    const signOut = async () => {
        setError(null);
        try {
            await firebaseSignOut(auth);
            setUser(null);
        } catch (err) {
            setError('Failed to sign out. Please try again.');
            console.error('[Auth] Sign out error:', err);
        }
    };

    const value: AuthContextType = {
        user,
        loading,
        error,
        rateLimited,
        rateLimitSecondsLeft,
        signInWithGoogle,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
