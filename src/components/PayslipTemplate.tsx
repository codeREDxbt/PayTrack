import { useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Employee, PayrollEntry } from '../lib/types';
import { formatCurrency } from '../utils/salaryCalculator';
import { formatDateReadable } from '../lib/utils';
import { Button } from './ui';
import { Download } from 'lucide-react';

// ================================
// Payslip Template Component
// Generates downloadable PDF payslips
// ================================

interface PayslipTemplateProps {
    employee: Employee;
    payroll: PayrollEntry;
    companyName?: string;
    companyAddress?: string;
    month: string; // YYYY-MM format
}

export function PayslipTemplate({
    employee,
    payroll,
    companyName = 'Your Company',
    companyAddress = 'Company Address',
    month,
}: PayslipTemplateProps) {
    const payslipRef = useRef<HTMLDivElement>(null);

    const handleDownloadPDF = async () => {
        if (!payslipRef.current) return;

        try {
            // Capture the payslip as canvas
            const canvas = await html2canvas(payslipRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            // Create PDF
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const imgWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));

            // Generate filename
            const fileName = `payslip_${employee.name.replace(/\s+/g, '_')}_${month}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('PDF generation failed:', error);
        }
    };

    // Parse month for display
    const monthDate = new Date(month + '-01');
    const monthDisplay = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-4">
            {/* Download Button */}
            <Button variant="primary" onClick={handleDownloadPDF}>
                <Download className="w-4 h-4" />
                Download Payslip
            </Button>

            {/* Payslip Preview - This will be converted to PDF */}
            <div
                ref={payslipRef}
                className="bg-white text-gray-900 p-8 rounded-lg shadow-lg max-w-2xl mx-auto"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
                {/* Header */}
                <div className="border-b-2 border-gray-200 pb-4 mb-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
                            <p className="text-sm text-gray-600">{companyAddress}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-semibold text-gray-900">SALARY SLIP</p>
                            <p className="text-sm text-gray-600">{monthDisplay}</p>
                        </div>
                    </div>
                </div>

                {/* Employee Details */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Employee Name</h3>
                        <p className="text-base font-semibold">{employee.name}</p>
                    </div>
                    <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Employee ID</h3>
                        <p className="text-base">{employee.id}</p>
                    </div>
                    <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Department</h3>
                        <p className="text-base">{employee.department}</p>
                    </div>
                    <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Designation</h3>
                        <p className="text-base">{employee.role}</p>
                    </div>
                    <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Date of Joining</h3>
                        <p className="text-base">{formatDateReadable(employee.joinDate)}</p>
                    </div>
                    <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Pay Period</h3>
                        <p className="text-base">{monthDisplay}</p>
                    </div>
                </div>

                {/* Earnings & Deductions */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Earnings */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
                            Earnings
                        </h3>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Base Pay ({payroll.daysWorked} days)</span>
                                <span className="text-sm font-medium">{formatCurrency(payroll.basePay)}</span>
                            </div>
                            {payroll.overtimePay > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Overtime ({payroll.overtimeHours} hrs)</span>
                                    <span className="text-sm font-medium">{formatCurrency(payroll.overtimePay)}</span>
                                </div>
                            )}
                            <div className="flex justify-between pt-2 border-t border-gray-100">
                                <span className="text-sm font-semibold">Gross Earnings</span>
                                <span className="text-sm font-semibold">{formatCurrency(payroll.basePay + payroll.overtimePay)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Deductions */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
                            Deductions
                        </h3>
                        <div className="space-y-2">
                            {payroll.deductions > 0 ? (
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Deductions</span>
                                    <span className="text-sm font-medium">{formatCurrency(payroll.deductions)}</span>
                                </div>
                            ) : (
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">No deductions</span>
                                    <span className="text-sm font-medium">{formatCurrency(0)}</span>
                                </div>
                            )}
                            <div className="flex justify-between pt-2 border-t border-gray-100">
                                <span className="text-sm font-semibold">Total Deductions</span>
                                <span className="text-sm font-semibold">{formatCurrency(payroll.deductions)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Net Pay */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-900">Net Pay</span>
                        <span className="text-2xl font-bold text-green-600">{formatCurrency(payroll.netPay)}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t border-gray-200 text-center">
                    <p className="text-xs text-gray-500">
                        This is a computer-generated document. No signature required.
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Generated on {formatDateReadable(new Date().toISOString())}
                    </p>
                </div>
            </div>
        </div>
    );
}

// Standalone function for direct PDF generation without preview
export async function generatePayslipPDF(
    employee: Employee,
    payroll: PayrollEntry,
    month: string,
    companyName: string = 'Your Company'
): Promise<void> {
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const monthDate = new Date(month + '-01');
    const monthDisplay = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Set font
    pdf.setFont('helvetica');

    // Header
    pdf.setFontSize(20);
    pdf.setTextColor(0, 0, 0);
    pdf.text(companyName, 20, 25);

    pdf.setFontSize(14);
    pdf.setTextColor(100, 100, 100);
    pdf.text('SALARY SLIP', 150, 25);
    pdf.setFontSize(10);
    pdf.text(monthDisplay, 150, 32);

    // Line
    pdf.setDrawColor(200, 200, 200);
    pdf.line(20, 40, 190, 40);

    // Employee Details
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    let y = 50;

    const addRow = (label: string, value: string, x: number) => {
        pdf.setTextColor(100, 100, 100);
        pdf.text(label, x, y);
        pdf.setTextColor(0, 0, 0);
        pdf.text(value, x, y + 5);
    };

    addRow('Employee Name', employee.name, 20);
    addRow('Employee ID', employee.id, 110);
    y += 15;
    addRow('Department', employee.department, 20);
    addRow('Designation', employee.role, 110);
    y += 15;
    addRow('Pay Period', monthDisplay, 20);

    // Earnings
    y += 20;
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Earnings', 20, y);
    pdf.line(20, y + 2, 95, y + 2);

    y += 10;
    pdf.setFontSize(10);
    pdf.setTextColor(60, 60, 60);
    pdf.text(`Base Pay (${payroll.daysWorked} days)`, 20, y);
    pdf.text(formatCurrency(payroll.basePay), 80, y, { align: 'right' });

    if (payroll.overtimePay > 0) {
        y += 7;
        pdf.text(`Overtime (${payroll.overtimeHours} hrs)`, 20, y);
        pdf.text(formatCurrency(payroll.overtimePay), 80, y, { align: 'right' });
    }

    y += 10;
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Gross Earnings:', 20, y);
    pdf.text(formatCurrency(payroll.basePay + payroll.overtimePay), 80, y, { align: 'right' });

    // Net Pay
    y += 20;
    pdf.setFillColor(240, 240, 240);
    pdf.rect(20, y - 5, 170, 15, 'F');
    pdf.setFontSize(14);
    pdf.text('Net Pay:', 25, y + 4);
    pdf.setTextColor(34, 139, 34); // Green
    pdf.text(formatCurrency(payroll.netPay), 185, y + 4, { align: 'right' });

    // Footer
    y = 270;
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text('This is a computer-generated document. No signature required.', 105, y, { align: 'center' });

    // Save
    const fileName = `payslip_${employee.name.replace(/\s+/g, '_')}_${month}.pdf`;
    pdf.save(fileName);
}
