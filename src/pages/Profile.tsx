import { User, Mail, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../components/ui';

// ================================
// Profile Page
// User account information
// ================================

export function Profile() {
    const { user, signOut } = useAuth();

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <p className="text-[--color-text-muted]">Not signed in</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-[--color-text-primary]">
                    Profile
                </h1>
                <p className="text-[--color-text-secondary] mt-1">
                    Your account information
                </p>
            </div>

            {/* Profile Card */}
            <Card padding="lg">
                <div className="flex items-start gap-6">
                    {/* Avatar */}
                    {user.photoURL ? (
                        <img
                            src={user.photoURL}
                            alt={user.displayName || 'User'}
                            className="w-20 h-20 rounded-full border-2 border-[--color-accent-gold]"
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center">
                            <User className="w-10 h-10 text-[--color-accent-gold]" />
                        </div>
                    )}

                    {/* Info */}
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-[--color-text-primary]">
                            {user.displayName || 'User'}
                        </h2>
                        <div className="flex items-center gap-2 mt-2 text-[--color-text-secondary]">
                            <Mail className="w-4 h-4" />
                            <span>{user.email}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[--color-text-muted] text-sm">
                            <Shield className="w-4 h-4" />
                            <span>Signed in with Google</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Account Details */}
            <Card padding="md">
                <CardHeader>
                    <CardTitle>Account Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-[--color-text-muted]">User ID</p>
                            <p className="text-sm font-mono text-[--color-text-secondary] truncate">
                                {user.uid}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-[--color-text-muted]">Email Verified</p>
                            <p className="text-sm text-[--color-success]">
                                {user.emailVerified ? 'Verified' : 'Not verified'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sign Out */}
            <Card padding="md">
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-[--color-text-primary]">Sign Out</h3>
                            <p className="text-sm text-[--color-text-muted]">
                                Sign out of your account on this device
                            </p>
                        </div>
                        <Button variant="danger" onClick={handleSignOut}>
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
