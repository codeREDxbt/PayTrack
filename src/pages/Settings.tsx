import { useState } from 'react';
import {
    Save,
    RefreshCw,
    Download,
    Upload,
    Sun,
    Moon,
    Monitor,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Select } from '../components/ui';

// ================================
// Settings Page
// App configuration
// ================================

export function Settings() {
    const { theme, setTheme } = useTheme();
    const { shiftConfig, setShiftConfig, settings, setSettings } = useApp();

    const [localShiftConfig, setLocalShiftConfig] = useState(shiftConfig);
    const [localSettings, setLocalSettings] = useState(settings);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        // Simulate save delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        setShiftConfig(localShiftConfig);
        setSettings(localSettings);
        setIsSaving(false);
    };

    const handleExport = () => {
        // Placeholder for data export
        console.log('Exporting data...');
    };

    const handleImport = () => {
        // Placeholder for data import
        console.log('Importing data...');
    };

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[--color-text-primary]">
                        Settings
                    </h1>
                    <p className="text-[--color-text-secondary] mt-1">
                        Configure your salary tracker
                    </p>
                </div>
                <Button variant="primary" size="sm" onClick={handleSave} isLoading={isSaving}>
                    <Save className="w-4 h-4" />
                    Save Changes
                </Button>
            </div>

            {/* Appearance */}
            <Card padding="md">
                <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-[--color-text-secondary] mb-3 block">
                            Theme
                        </label>
                        <div className="flex gap-3">
                            {[
                                { value: 'dark', label: 'Dark', icon: Moon },
                                { value: 'light', label: 'Light', icon: Sun },
                                { value: 'system', label: 'System', icon: Monitor },
                            ].map((option) => {
                                const Icon = option.icon;
                                return (
                                    <button
                                        key={option.value}
                                        onClick={() => setTheme(option.value as typeof theme)}
                                        className={`
                      flex items-center gap-2 px-4 py-2.5
                      rounded-[--radius-md] border
                      transition-all
                      ${theme === option.value
                                                ? 'border-[--color-accent-gold] bg-[--color-accent-gold]/10 text-[--color-accent-gold]'
                                                : 'border-[--color-border] text-[--color-text-secondary] hover:border-[--color-border-subtle] hover:bg-[--color-bg-tertiary]'
                                            }
                    `}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="text-sm font-medium">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Shift Configuration */}
            <Card padding="md">
                <CardHeader>
                    <CardTitle>Shift Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Hours Per Day"
                            type="number"
                            value={localShiftConfig.hoursPerDay}
                            onChange={(e) =>
                                setLocalShiftConfig({
                                    ...localShiftConfig,
                                    hoursPerDay: Number(e.target.value),
                                })
                            }
                            hint="Standard working hours per day"
                        />
                        <Input
                            label="Working Days Per Month"
                            type="number"
                            value={localShiftConfig.workingDaysPerMonth}
                            onChange={(e) =>
                                setLocalShiftConfig({
                                    ...localShiftConfig,
                                    workingDaysPerMonth: Number(e.target.value),
                                })
                            }
                            hint="Used for calculating hourly rate"
                        />
                    </div>
                    <Input
                        label="Overtime Multiplier"
                        type="number"
                        step="0.1"
                        value={localShiftConfig.overtimeMultiplier}
                        onChange={(e) =>
                            setLocalShiftConfig({
                                ...localShiftConfig,
                                overtimeMultiplier: Number(e.target.value),
                            })
                        }
                        hint="Overtime pay rate (e.g., 1 = regular rate, 1.5 = time and a half)"
                    />

                    {/* Formula Preview */}
                    <div className="mt-4 p-4 bg-[--color-bg-tertiary] rounded-[--radius-lg]">
                        <p className="text-sm text-[--color-text-muted] mb-2">Hourly Rate Formula:</p>
                        <p className="text-sm font-mono text-[--color-text-primary]">
                            Hourly Rate = Monthly Pay ÷ ({localShiftConfig.workingDaysPerMonth} days × {localShiftConfig.hoursPerDay} hours)
                        </p>
                        <p className="text-xs text-[--color-text-muted] mt-2">
                            Example: ₹75,000/month = ₹{Math.round(75000 / (localShiftConfig.workingDaysPerMonth * localShiftConfig.hoursPerDay))}/hour
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Company Settings */}
            <Card padding="md">
                <CardHeader>
                    <CardTitle>Company Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        label="Company Name"
                        value={localSettings.companyName}
                        onChange={(e) =>
                            setLocalSettings({ ...localSettings, companyName: e.target.value })
                        }
                        placeholder="Enter your company name"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Currency"
                            options={[
                                { value: 'INR', label: 'Indian Rupee (₹)' },
                                { value: 'USD', label: 'US Dollar ($)' },
                                { value: 'EUR', label: 'Euro (€)' },
                                { value: 'GBP', label: 'British Pound (£)' },
                            ]}
                            value={localSettings.currency}
                            onChange={(e) =>
                                setLocalSettings({ ...localSettings, currency: e.target.value })
                            }
                        />
                        <Input
                            label="Currency Symbol"
                            value={localSettings.currencySymbol}
                            onChange={(e) =>
                                setLocalSettings({ ...localSettings, currencySymbol: e.target.value })
                            }
                            placeholder="₹"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Data Management */}
            <Card padding="md">
                <CardHeader>
                    <CardTitle>Data Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-[--color-text-secondary]">
                        Backup your data or restore from a previous backup.
                    </p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={handleExport}>
                            <Download className="w-4 h-4" />
                            Export Data
                        </Button>
                        <Button variant="secondary" onClick={handleImport}>
                            <Upload className="w-4 h-4" />
                            Import Data
                        </Button>
                    </div>
                    <div className="mt-4 p-4 bg-[--color-warning-muted]/20 border border-[--color-warning]/30 rounded-[--radius-lg]">
                        <p className="text-sm text-[--color-warning]">
                            ⚠️ Importing data will overwrite existing data. Make sure to backup first.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* About */}
            <Card padding="md">
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-[--color-text-primary]">Salary Tracker</h3>
                            <p className="text-sm text-[--color-text-muted]">Version 1.0.0</p>
                        </div>
                        <Button variant="ghost" size="sm">
                            <RefreshCw className="w-4 h-4" />
                            Check for Updates
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
