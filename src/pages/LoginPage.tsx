import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui';
import { Input } from '../components/ui';
import { Logo } from '../components/Logo';

// ================================
// Login Page
// Email + password against the PayTrack API. The demo accounts below are the
// ones seeded by server/bootstrap.js from the Employee table.
// ================================

const DEMO_ACCOUNTS = [
    { label: 'ADMIN', email: 'rajesh.sharma@paytrack.internal', password: 'Admin@123' },
    { label: 'HR', email: 'sunita.rao@paytrack.internal', password: 'Hr@12345' },
    { label: 'EMPLOYEE', email: 'priya.patel@paytrack.internal', password: 'Employee@123' },
];

export function LoginPage() {
    const { user, loading, error, signIn, clearError } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    if (user && !loading) return <Navigate to="/" replace />;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await signIn(email.trim(), password);
        } catch {
            // The context already turned it into a readable message.
        }
    };

    const useDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
        clearError();
        setEmail(account.email);
        setPassword(account.password);
    };

    return (
        <div className="min-h-screen bg-[--color-bg-primary] flex items-center justify-center p-4">
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>

            <div className="w-full max-w-md">
                <header className="flex flex-col items-center mb-8">
                    <Logo size="xl" />
                    <h1 className="text-[--color-text-secondary] mt-4 tracking-wide font-medium">
                        PAYROLL COMMAND CENTER
                    </h1>
                </header>

                <main
                    id="main-content"
                    className="bg-[--color-bg-secondary] border border-[--color-border] rounded-2xl p-8 shadow-xl"
                >
                    <h2 className="text-xl font-semibold text-[--color-text-primary] text-center mb-6">
                        Sign in to PayTrack
                    </h2>

                    {error && (
                        <div
                            className="mb-4 p-3 bg-[--color-danger]/10 border border-[--color-danger]/20 rounded-lg"
                            role="alert"
                        >
                            <p className="text-sm text-[--color-danger]">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label="Work email"
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@paytrack.internal"
                            required
                        />
                        <Input
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                            required
                        />
                        <Button type="submit" variant="primary" className="w-full h-12" isLoading={loading}>
                            <LogIn className="w-5 h-5" />
                            Sign in
                        </Button>
                    </form>

                    <div className="flex items-center gap-4 my-6">
                        <div className="h-px flex-1 bg-[--color-border]" />
                        <span className="text-xs text-[--color-text-muted] uppercase tracking-widest">Demo accounts</span>
                        <div className="h-px flex-1 bg-[--color-border]" />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {DEMO_ACCOUNTS.map((account) => (
                            <Button
                                key={account.label}
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => useDemo(account)}
                            >
                                {account.label}
                            </Button>
                        ))}
                    </div>

                    <p className="flex items-start gap-2 text-xs text-[--color-text-muted] mt-6">
                        <ShieldCheck className="w-4 h-4 flex-shrink-0 text-[--color-success]" />
                        Sessions are bearer tokens stored hashed in the Session table and expire after 12 hours.
                        Role permissions are enforced by the API and the Phase 4 secure views.
                    </p>
                </main>

                <footer className="text-xs text-[--color-text-muted] text-center mt-6">
                    &copy; 2026 PayTrack &bull; DBMS Capstone
                </footer>
            </div>
        </div>
    );
}
