import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ================================
// Protected Route
// Redirects to login if not authenticated
// ================================

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { user, loading } = useAuth();

    // Show loading skeleton while checking auth
    if (loading) {
        return (
            <div className="min-h-screen bg-[--color-bg-primary] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    {/* Loading spinner */}
                    <div className="w-10 h-10 border-3 border-[--color-accent-gold] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[--color-text-muted] text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
