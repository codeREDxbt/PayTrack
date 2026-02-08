import { useState, useRef } from 'react';
import {
    Save,
    Download,
    Upload,
    Sun,
    Moon,
    Monitor,
    Loader2,
    AlertTriangle,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Select } from '../components/ui';

// ================================
// Settings Page
// App configuration with import/export
// ================================

export function Settings() {
    const { theme, setTheme } = useTheme();
    const {
        shiftConfig, setShiftConfig,
        settings, setSettings,
        employees,
        attendance,
        payroll,
        addEmployee,
        markAttendance,
    } = useApp();

    const [localShiftConfig, setLocalShiftConfig] = useState(shiftConfig);
    const [localSettings, setLocalSettings] = useState(settings);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        setIsSaving(true);
        await new Promise((resolve) => setTimeout(resolve, 500));
        setShiftConfig(localShiftConfig);
        setSettings(localSettings);
        setIsSaving(false);
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const data = {
                exportDate: new Date().toISOString(),
                version: '1.0.0',
                employees: employees,
                attendance: attendance,
                payroll: payroll,
                settings: localSettings,
                shiftConfig: localShiftConfig,
            };

            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `paytrack-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate data structure
            if (!data.employees || !Array.isArray(data.employees)) {
                throw new Error('Invalid backup file: missing employees data');
            }

            // Confirm import
            const confirmed = window.confirm(
                `This will import ${data.employees.length} employees, ${data.attendance?.length || 0} attendance records, and ${data.payroll?.length || 0} payroll entries. Continue?`
            );

            if (!confirmed) {
                setIsImporting(false);
                return;
            }

            // Import employees
            for (const emp of data.employees) {
                const { id, createdAt, updatedAt, ...employeeData } = emp;
                await addEmployee(employeeData);
            }

            // Import attendance
            if (data.attendance) {
                for (const record of data.attendance) {
                    const { id, createdAt, updatedAt, ...attendanceData } = record;
                    await markAttendance(attendanceData);
                }
            }

            // Import settings
            if (data.settings) {
                setSettings(data.settings);
            }
            if (data.shiftConfig) {
                setShiftConfig(data.shiftConfig);
            }

            alert('Import completed successfully!');
        } catch (error) {
            console.error('Import failed:', error);
            alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
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
                        Backup your data or restore from a previous backup. Export includes all employees, attendance, and payroll records.
                    </p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Export Data
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                        >
                            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Import Data
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImport}
                            className="hidden"
                        />
                    </div>
                    <div className="mt-4 p-4 bg-[--color-warning]/10 border border-[--color-warning]/30 rounded-[--radius-lg] flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-[--color-warning] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[--color-warning]">
                            Importing data will add new records to your existing data. Make sure to backup first if needed.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* About */}
            <Card padding="md">
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-[--color-text-primary]">PAYTRACK</h3>
                            <p className="text-sm text-[--color-text-muted]">v1.3</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
