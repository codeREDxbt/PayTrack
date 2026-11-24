import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ================================
// Protected Route
// Redirects to login when signed out, and away from staff-only pages for an
// EMPLOYEE. The API rejects the same requests server-side; this guard exists so
// the UI never offers an action the role cannot complete.
// ================================

interface ProtectedRouteProps {
    children: React.ReactNode;
    staffOnly?: boolean;
}

export function ProtectedRoute({ children, staffOnly = false }: ProtectedRouteProps) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-[--color-bg-primary] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-3 border-[--color-accent-gold] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[--color-text-muted] text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;
    if (staffOnly && !user.isStaff) return <Navigate to="/" replace />;

    return <>{children}</>;
}
