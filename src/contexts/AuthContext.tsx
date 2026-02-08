import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
    signInWithRedirect,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    getRedirectResult,
    type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

// ================================
// Auth Context
// Firebase Google authentication
// ================================

// Demo user for testing (remove later)
const DEMO_USER = {
    uid: 'demo-user-123',
    email: 'demo@paytrack.local',
    displayName: 'Demo User',
    photoURL: null,
} as unknown as User;

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    isDemo: boolean;
    signInWithGoogle: () => Promise<void>;
    signInDemo: () => void;
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
    const [isDemo, setIsDemo] = useState(false);

    useEffect(() => {
        // Check for demo session in localStorage
        const demoSession = localStorage.getItem('paytrack_demo_session');
        if (demoSession === 'true') {
            setUser(DEMO_USER);
            setIsDemo(true);
            setLoading(false);
            return;
        }

        // Check for redirect result (mobile flow)
        getRedirectResult(auth)
            .then((result) => {
                if (result?.user) {
                    setUser(result.user);
                }
            })
            .catch((err) => {
                console.error('Redirect error:', err);
                setError(err.message);
            });

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
            // Use redirect for better mobile compatibility
            await signInWithRedirect(auth, googleProvider);
        } catch (err) {
            console.error('Sign in error:', err);
            setError(err instanceof Error ? err.message : 'Failed to sign in');
            setLoading(false);
        }
    };

    // Demo login (no Firebase required)
    const signInDemo = () => {
        localStorage.setItem('paytrack_demo_session', 'true');
        setUser(DEMO_USER);
        setIsDemo(true);
        setLoading(false);
    };

    const signOut = async () => {
        setError(null);
        try {
            // Clear demo session
            localStorage.removeItem('paytrack_demo_session');
            setIsDemo(false);

            if (!isDemo) {
                await firebaseSignOut(auth);
            }
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
        isDemo,
        signInWithGoogle,
        signInDemo,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
