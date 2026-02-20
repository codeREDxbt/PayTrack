import { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { useApp } from '../contexts/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';

export function PayrollTrendChart() {
    const { payroll, currentMonth } = useApp();

    const chartData = useMemo(() => {
        // Get the last 6 months based on currentMonth
        const result = [];
        const baseDate = new Date(`${currentMonth}-01T00:00:00`);

        for (let i = 5; i >= 0; i--) {
            const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
            const monthStr = d.toISOString().slice(0, 7);
            const monthLabel = d.toLocaleDateString('en-US', { month: 'short' });

            // Sum net pay for this month
            const monthlyTotal = payroll
                .filter(p => p.month === monthStr)
                .reduce((sum, p) => sum + p.netPay, 0);

            result.push({
                name: monthLabel,
                month: monthStr,
                total: monthlyTotal
            });
        }
        return result;
    }, [payroll, currentMonth]);

    // Check if we have any data to show
    const hasData = chartData.some(d => d.total > 0);

    return (
        <Card padding="md" className="h-full">
            <CardHeader>
                <CardTitle>Payroll Trends</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    {!hasData ? (
                        <div className="h-full flex items-center justify-center text-[--color-text-muted] font-bold uppercase tracking-widest text-sm text-center">
                            No payroll data yet.<br />Generate payroll to see trends.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 'bold' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 'bold' }}
                                    tickFormatter={(value) => `₹${value.toLocaleString()}`}
                                />
                                <Tooltip
                                    cursor={{ fill: 'var(--color-bg-tertiary)' }}
                                    contentStyle={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '2px solid var(--color-border)',
                                        borderRadius: '0',
                                        boxShadow: '4px 4px 0 0 var(--color-border)',
                                        fontWeight: 'bold'
                                    }}
                                    formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, 'Net Payout']}
                                />
                                <Bar dataKey="total" radius={[2, 2, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.month === currentMonth ? 'var(--color-text-primary)' : 'var(--color-accent-gold)'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
