import { Mail, Phone, Shield, LogOut, Briefcase, CalendarDays, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import { formatDateReadable, initialsOf } from '../lib/format';

// ================================
// Profile
// Shows the identity the API resolved from the bearer session (GET /auth/me)
// plus the matching Employee row. Editing is staff-only through People, so an
// employee sees a read-only record here.
// ================================

export function Profile() {
    const { user, signOut } = useAuth();
    const { employees } = useApp();

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <p className="text-[--color-text-muted]">Not signed in</p>
            </div>
        );
    }

    const record = employees.find((employee) => employee.employeeId === user.employeeId);

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-3xl font-black uppercase tracking-widest text-[--color-text-primary] sm:text-4xl">Profile</h1>
                <p className="text-[--color-text-secondary] mt-1 text-xs font-bold uppercase tracking-widest">
                    Your account and employment record
                </p>
            </div>

            <Card padding="lg">
                <div className="flex flex-col sm:flex-row items-start gap-6">
                    <div className="w-20 h-20 rounded-full bg-[--color-accent-gold]/20 flex items-center justify-center flex-shrink-0 text-2xl font-black text-[--color-accent-gold]">
                        {initialsOf(user.fullName)}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="text-2xl font-black uppercase tracking-widest text-[--color-text-primary]">
                                    {user.fullName}
                                </h2>
                                <p className="text-sm text-[--color-text-secondary] mt-1">{user.jobTitle}</p>
                                <div className="flex items-center gap-2 mt-2 text-[--color-text-secondary]">
                                    <Mail className="w-4 h-4 flex-shrink-0" />
                                    <span className="break-all text-sm">{user.email}</span>
                                </div>
                                {user.phone && (
                                    <div className="flex items-center gap-2 mt-1 text-[--color-text-secondary]">
                                        <Phone className="w-4 h-4 flex-shrink-0" />
                                        <span className="text-sm">{user.phone}</span>
                                    </div>
                                )}
                            </div>
                            {user.isStaff ? (
                                <Link to="/people">
                                    <Button variant="secondary" size="sm">Manage people</Button>
                                </Link>
                            ) : (
                                <Link to="/settings">
                                    <Button variant="secondary" size="sm">
                                        <Settings className="w-4 h-4" /> Settings
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Card padding="md">
                    <CardHeader>
                        <CardTitle>Employment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[--color-text-muted] flex items-center gap-2">
                                <Briefcase className="w-4 h-4" /> Department
                            </span>
                            <span className="text-[--color-text-primary]">{user.department}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[--color-text-muted] flex items-center gap-2">
                                <CalendarDays className="w-4 h-4" /> Joined
                            </span>
                            <span className="text-[--color-text-primary]">
                                {formatDateReadable(record?.joinDate ?? user.joinDate)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[--color-text-muted] flex items-center gap-2">
                                <Shield className="w-4 h-4" /> System role
                            </span>
                            <span className="text-[--color-text-primary]">{user.systemRole}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[--color-text-muted]">Employee ID</span>
                            <span className="text-[--color-text-primary] font-mono">#{user.employeeId}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[--color-text-muted]">Status</span>
                            <span
                                className={
                                    user.employeeStatus === 'ACTIVE'
                                        ? 'text-[--color-success]'
                                        : 'text-[--color-danger]'
                                }
                            >
                                {user.employeeStatus}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[--color-text-muted]">Last login</span>
                            <span className="text-[--color-text-primary]">{formatDateReadable(user.lastLoginAt)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card padding="md">
                    <CardHeader>
                        <CardTitle>Permissions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-[--color-text-muted] mb-3">
                            Resolved from UserRole → RolePermission by the API.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {user.permissions.length === 0 && (
                                <span className="text-sm text-[--color-text-muted]">No permissions granted.</span>
                            )}
                            {user.permissions.map((permission) => (
                                <span
                                    key={permission}
                                    className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider
                                        bg-[--color-bg-tertiary] border border-[--color-border] text-[--color-text-secondary]"
                                >
                                    {permission}
                                </span>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card padding="md">
                <CardContent>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-[--color-text-primary]">Sign out</h3>
                            <p className="text-xs uppercase tracking-widest font-bold text-[--color-text-muted] mt-1">
                                Revokes this bearer session on the server
                            </p>
                        </div>
                        <Button variant="danger" onClick={() => void signOut()}>
                            <LogOut className="w-4 h-4" /> Sign out
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
