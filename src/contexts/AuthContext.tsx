import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

// ================================
// Auth Context
// Firebase Google authentication
// ================================

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
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

    useEffect(() => {
        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const signInWithGoogle = async () => {
        setError(null);
        setLoading(true);
        try {
            // Use popup for better SPA compatibility
            await signInWithPopup(auth, googleProvider);
        } catch (err: unknown) {
            console.error('Sign in error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to sign in';
            // Don't show error for popup closed by user
            if (errorMessage.includes('popup-closed-by-user')) {
                setLoading(false);
                return;
            }
            setError(errorMessage);
            setLoading(false);
        }
    };

    const signOut = async () => {
        setError(null);
        try {
            await firebaseSignOut(auth);
            setUser(null);
        } catch (err) {
            console.error('Sign out error:', err);
            setError(err instanceof Error ? err.message : 'Failed to sign out');
        }
    };

    const value: AuthContextType = {
        user,
        loading,
        error,
        signInWithGoogle,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
