import { useState } from 'react';
import { User, Mail, LogOut, Shield, Edit2 } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, CardHeader, CardTitle, CardContent, Modal, Input } from '../components/ui';

// ================================
// Profile Page
// User account information
// ================================

export function Profile() {
    const { user, signOut } = useAuth();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        displayName: '',
        photoURL: '',
    });

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    };

    const handleEditProfile = () => {
        if (user) {
            setFormData({
                displayName: user.displayName || '',
                photoURL: user.photoURL || '',
            });
            setIsEditModalOpen(true);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsSaving(true);
        try {
            await updateProfile(user, {
                displayName: formData.displayName,
                photoURL: formData.photoURL,
            });
            setIsEditModalOpen(false);
            // Force refresh or let Firebase Auth state propagation handle it (it should trigger re-render)
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile. Please try again.');
        } finally {
            setIsSaving(false);
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
                <h1 className="text-4xl font-black uppercase tracking-widest text-[--color-text-primary]">
                    Profile
                </h1>
                <p className="text-[--color-text-secondary] mt-1 text-xs font-bold uppercase tracking-widest">
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
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-widest text-[--color-text-primary]">
                                    {user.displayName || 'User'}
                                </h2>
                                <div className="flex items-center gap-2 mt-2 text-[--color-text-secondary] font-mono">
                                    <Mail className="w-4 h-4" />
                                    <span>{user.email}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-2 text-[--color-text-muted] text-sm uppercase tracking-wider font-bold">
                                    <Shield className="w-4 h-4" />
                                    <span>Signed in with Google</span>
                                </div>
                            </div>
                            <Button variant="secondary" size="md" onClick={handleEditProfile} className="border-2 border-[--color-border]">
                                <Edit2 className="w-4 h-4" />
                                Edit
                            </Button>
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
                            <h3 className="font-black uppercase tracking-wider text-[--color-text-primary]">Sign Out</h3>
                            <p className="text-xs uppercase tracking-widest font-bold text-[--color-text-muted] mt-1">
                                Sign out of your account on this device
                            </p>
                        </div>
                        <Button variant="danger" onClick={handleSignOut} className="border-2 border-[--color-border]">
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    </div>
                </CardContent>
            </Card>
            {/* Edit Profile Modal */}

            {/* Edit Profile Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edit Profile"
            >
                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <Input
                        label="Display Name"
                        value={formData.displayName}
                        onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                        required
                    />
                    <Input
                        label="Photo URL"
                        value={formData.photoURL}
                        onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                        placeholder="https://..."
                    />
                    <div className="flex gap-3 pt-4">
                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsEditModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" className="flex-1" disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div >
    );
}
