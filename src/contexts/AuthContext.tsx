import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, getStoredToken, storeToken } from '../lib/api';
import type { AuthUser } from '../lib/types';

// ================================
// Auth Context
// Session-based authentication against the PayTrack API. The bearer token is
// minted by POST /auth/login, stored in localStorage, and validated with
// GET /auth/me on reload. The database only keeps its SHA-256 digest.
// ================================

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Restore a stored session once, so a page reload does not sign the user out.
    useEffect(() => {
        let cancelled = false;
        const token = getStoredToken();
        if (!token) {
            setLoading(false);
            return;
        }
        api.me()
            .then((data) => {
                if (!cancelled) setUser(data.user);
            })
            .catch(() => {
                storeToken(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // The API client fires this when a request answers 401 (revoked or expired).
    useEffect(() => {
        const onUnauthorized = () => {
            setUser(null);
            setError('Your session expired. Please sign in again.');
        };
        window.addEventListener('paytrack:unauthorized', onUnauthorized);
        return () => window.removeEventListener('paytrack:unauthorized', onUnauthorized);
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.login(email, password);
            storeToken(data.token);
            setUser(data.user);
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Sign in failed. Please try again.';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const signOut = useCallback(async () => {
        try {
            await api.logout();
        } catch {
            // The local session is dropped even if the revoke call fails.
        }
        storeToken(null);
        setUser(null);
        setError(null);
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return (
        <AuthContext.Provider value={{ user, loading, error, signIn, signOut, clearError }}>
            {children}
        </AuthContext.Provider>
    );
}
