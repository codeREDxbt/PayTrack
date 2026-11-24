/**
 * Row → response-shape mapping. Responses are assembled by explicit column
 * selection, never `SELECT *`, so credential columns can never leak even if a
 * table gains new ones later.
 */

const round2 = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100);

export const EMPLOYEE_COLUMNS = [
  'e.employee_id', 'e.first_name', 'e.last_name', 'e.email', 'e.phone',
  'e.department', 'e.role', 'e.system_role', 'e.join_date', 'e.status',
  'e.created_at', 'e.updated_at'
].join(', ');

export function toEmployee(row) {
  if (!row) return null;
  return {
    employeeId: Number(row.employee_id),
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    email: row.email,
    phone: row.phone,
    department: row.department,
    jobTitle: row.role,
    systemRole: row.system_role,
    joinDate: row.join_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toAttendance(row) {
  if (!row) return null;
  return {
    attendanceId: Number(row.attendance_id),
    employeeId: Number(row.employee_id),
    employeeName: row.employee_name ?? undefined,
    department: row.department ?? undefined,
    date: row.attendance_date,
    status: row.status,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    hoursWorked: round2(row.hours_worked),
    overtimeHours: round2(row.overtime_hours),
    isLate: Number(row.is_late) === 1,
    lateMinutes: Number(row.late_minutes)
  };
}

export const PAYROLL_SUMMARY_COLUMNS = `
  p.payroll_id, p.employee_id, p.pay_period_year, p.pay_period_month,
  p.working_days, p.present_days, p.absent_days, p.half_days, p.leave_days,
  p.overtime_hours, p.gross_salary, p.tax_deduction, p.unpaid_leave_deduction,
  p.other_deductions, p.net_salary, p.status, p.payment_date,
  p.created_at, p.updated_at,
  e.first_name, e.last_name, e.email, e.department
`;

export function toPayrollSummary(row) {
  if (!row) return null;
  return {
    payrollId: Number(row.payroll_id),
    employeeId: Number(row.employee_id),
    employeeName: `${row.first_name} ${row.last_name}`,
    email: row.email,
    department: row.department,
    month: `${String(row.pay_period_year).padStart(4, '0')}-${String(row.pay_period_month).padStart(2, '0')}`,
    periodYear: Number(row.pay_period_year),
    periodMonth: Number(row.pay_period_month),
    workingDays: Number(row.working_days),
    presentDays: round2(row.present_days),
    absentDays: round2(row.absent_days),
    halfDays: Number(row.half_days),
    leaveDays: round2(row.leave_days),
    overtimeHours: round2(row.overtime_hours),
    grossSalary: round2(row.gross_salary),
    taxDeduction: round2(row.tax_deduction),
    unpaidLeaveDeduction: round2(row.unpaid_leave_deduction),
    otherDeductions: round2(row.other_deductions),
    netSalary: round2(row.net_salary),
    status: row.status,
    paymentDate: row.payment_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Payslip from vw_rpt_salary_slip (+ its line items). */
export function payslip(slipRow, lineItems) {
  const s = slipRow;
  const items = (lineItems || []).map((i) => ({
    sortOrder: Number(i.sort_order),
    itemType: i.item_type,
    code: i.item_code,
    label: i.item_label,
    amount: round2(i.amount)
  }));
  return {
    payrollId: Number(s.payroll_id),
    employee: {
      employeeId: Number(s.employee_id),
      fullName: s.employee_name,
      email: s.email,
      department: s.department,
      jobTitle: s.role
    },
    month: s.month_key,
    periodLabel: s.period_label,
    status: s.status,
    paymentDate: s.payment_date,
    salaryPackage: {
      salaryId: Number(s.salary_id),
      baseSalary: round2(s.base_salary),
      hra: round2(s.hra),
      allowances: round2(s.allowances)
    },
    attendance: {
      workingDays: Number(s.working_days),
      presentDays: round2(s.present_days),
      halfDays: Number(s.half_days),
      leaveDays: round2(s.leave_days),
      absentDays: round2(s.absent_days),
      overtimeHours: round2(s.overtime_hours)
    },
    earnings: {
      baseSalaryEarned: round2(s.base_salary_earned),
      allowancesEarned: round2(s.allowances_earned),
      overtimePay: round2(s.overtime_pay),
      grossSalary: round2(s.gross_salary)
    },
    deductions: {
      taxDeduction: round2(s.tax_deduction),
      unpaidLeaveDeduction: round2(s.unpaid_leave_deduction),
      otherDeductions: round2(s.other_deductions),
      totalDeductions: round2(round2(s.tax_deduction) + round2(s.unpaid_leave_deduction) + round2(s.other_deductions))
    },
    netSalary: round2(s.net_salary),
    computedNetSalary: round2(s.computed_net_salary),
    lineItems: items,
    generatedAt: s.created_at
  };
}

/** Fallback payslip shape when vw_rpt_salary_slip is unavailable. */
export function payslipFromPayroll(p, salary, lineItems) {
  return payslip({
    payroll_id: p.payroll_id,
    employee_id: p.employee_id,
    employee_name: `${p.first_name} ${p.last_name}`,
    email: p.email,
    department: p.department,
    role: p.role,
    month_key: `${String(p.pay_period_year).padStart(4, '0')}-${String(p.pay_period_month).padStart(2, '0')}`,
    period_label: `${p.pay_period_year}-${String(p.pay_period_month).padStart(2, '0')}`,
    status: p.status,
    payment_date: p.payment_date,
    salary_id: p.salary_id,
    base_salary: salary?.base_salary ?? null,
    hra: salary?.hra ?? null,
    allowances: salary?.allowances ?? null,
    working_days: p.working_days,
    present_days: p.present_days,
    absent_days: p.absent_days,
    half_days: p.half_days,
    leave_days: p.leave_days,
    overtime_hours: p.overtime_hours,
    base_salary_earned: p.base_salary_earned,
    allowances_earned: p.allowances_earned,
    overtime_pay: p.overtime_pay,
    gross_salary: p.gross_salary,
    tax_deduction: p.tax_deduction,
    unpaid_leave_deduction: p.unpaid_leave_deduction,
    other_deductions: p.other_deductions,
    net_salary: p.net_salary,
    computed_net_salary: round2(p.gross_salary - p.tax_deduction - p.unpaid_leave_deduction - p.other_deductions),
    created_at: p.created_at
  }, lineItems);
}

/** Same line-item shape reports.sql emits, built from one Payroll row. */
export function payrollLineItems(p) {
  return [
    { sort_order: 10, item_type: 'EARNING', item_code: 'BASE_SALARY', item_label: 'Base Salary (Prorated)', amount: p.base_salary_earned },
    { sort_order: 20, item_type: 'EARNING', item_code: 'HRA_AND_ALLOWANCES', item_label: 'HRA + Allowances (Prorated)', amount: p.allowances_earned },
    { sort_order: 30, item_type: 'EARNING', item_code: 'OVERTIME', item_label: 'Overtime Pay', amount: p.overtime_pay },
    { sort_order: 40, item_type: 'DEDUCTION', item_code: 'TAX_TDS', item_label: 'Income Tax (TDS, progressive slabs)', amount: p.tax_deduction },
    { sort_order: 50, item_type: 'DEDUCTION', item_code: 'UNPAID_LEAVE', item_label: 'Unpaid Leave Deduction', amount: p.unpaid_leave_deduction },
    { sort_order: 60, item_type: 'DEDUCTION', item_code: 'OTHER', item_label: 'Other Deductions', amount: p.other_deductions }
  ];
}
