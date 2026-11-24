import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { formatCurrency } from '../lib/format';
import type { TrendPoint } from '../lib/types';

// ================================
// Payroll Trend Chart
// Data comes from the API (six monthly payroll reads), so the chart shows the
// same net figures as the payroll page rather than a client-side estimate.
// ================================

interface PayrollTrendChartProps {
    data: TrendPoint[];
    currentMonth: string;
    scope: 'ORG' | 'SELF';
}

export function PayrollTrendChart({ data, currentMonth, scope }: PayrollTrendChartProps) {
    const hasData = data.some((point) => point.total > 0);

    return (
        <Card padding="md" className="h-full">
            <CardHeader>
                <CardTitle>Payroll Trends</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full min-w-0">
                    {!hasData ? (
                        <div className="h-full flex items-center justify-center text-[--color-text-muted] font-bold uppercase tracking-widest text-sm text-center">
                            No payroll data yet.
                            <br />
                            {scope === 'ORG' ? 'Generate payroll to see trends.' : 'Payslips appear once payroll is run.'}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} debounce={50}>
                            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 'bold' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 'bold' }}
                                    tickFormatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                                />
                                <Tooltip
                                    cursor={{ fill: 'var(--color-bg-tertiary)' }}
                                    contentStyle={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '2px solid var(--color-border)',
                                        borderRadius: '0',
                                        boxShadow: '4px 4px 0 0 var(--color-border)',
                                        fontWeight: 'bold',
                                    }}
                                    formatter={(value) => [formatCurrency(Number(value)), 'Net payout']}
                                />
                                <Bar dataKey="total" radius={[2, 2, 0, 0]}>
                                    {data.map((point) => (
                                        <Cell
                                            key={point.month}
                                            fill={point.month === currentMonth ? 'var(--color-text-primary)' : 'var(--color-accent-gold)'}
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
