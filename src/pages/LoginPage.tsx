import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui';

// ================================
// Login Page
// Premium dark login with Google sign-in
// ================================

export function LoginPage() {
    const { user, loading, error, signInWithGoogle } = useAuth();
    const navigate = useNavigate();

    // Redirect if already logged in
    if (user && !loading) {
        return <Navigate to="/" replace />;
    }

    const handleSignIn = async () => {
        try {
            await signInWithGoogle();
            // After successful sign-in, navigate to home
            navigate('/', { replace: true });
        } catch (err) {
            console.error('Sign in failed:', err);
        }
    };

    return (
        <div className="min-h-screen bg-[--color-bg-primary] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo & Branding */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[--color-accent-gold] to-[--color-accent-gold-dark] flex items-center justify-center shadow-lg">
                        <span className="text-2xl font-bold text-[--color-bg-primary]">P</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gradient-gold">
                        PayTrack
                    </h1>
                    <p className="text-[--color-text-secondary] mt-2">
                        Salary Tracker Command Center
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-[--color-bg-secondary] border border-[--color-border] rounded-2xl p-8 shadow-xl">
                    <h2 className="text-xl font-semibold text-[--color-text-primary] text-center mb-6">
                        Welcome Back
                    </h2>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-[--color-danger]/10 border border-[--color-danger]/20 rounded-lg">
                            <p className="text-sm text-[--color-danger]">{error}</p>
                        </div>
                    )}

                    {/* Google Sign In Button */}
                    <Button
                        variant="primary"
                        className="w-full h-12 text-base font-medium"
                        onClick={handleSignIn}
                        disabled={loading}
                    >
                        {loading ? (
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                <span>Signing in...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                {/* Google Icon */}
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path
                                        fill="currentColor"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                <span>Continue with Google</span>
                            </div>
                        )}
                    </Button>

                    {/* Divider */}
                    {/* Divider */}
                    <div className="flex items-center gap-4 my-6">
                        <div className="h-px flex-1 bg-[--color-border]" />
                        <span className="text-xs text-[--color-text-muted]">
                            Secure sign-in
                        </span>
                        <div className="h-px flex-1 bg-[--color-border]" />
                    </div>

                    {/* Info */}
                    <p className="text-xs text-[--color-text-muted] text-center">
                        Your data is stored securely in the cloud.<br />
                        Access from any device with your Google account.
                    </p>
                </div>

                {/* Footer */}
                <p className="text-xs text-[--color-text-muted] text-center mt-6">
                    © 2026 PayTrack • Employer Command Center
                </p>
            </div>
        </div>
    );
}
