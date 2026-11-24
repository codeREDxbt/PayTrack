#!/usr/bin/env node
/**
 * ============================================================================
 * PayTrack Interactive Terminal CLI (cli/paytrack-cli.js)
 * ============================================================================
 * Enterprise Command-Line Interface for PayTrack Attendance & Payroll.
 * Built with native Node.js v24 modules (node:sqlite, node:fs, node:path).
 *
 * Supported Commands:
 *   paytrack-cli --help
 *   paytrack-cli employees list
 *   paytrack-cli attendance punch --employee-id=<id> --status=<status>
 *   paytrack-cli reports attendance --month=<m> --year=<y>
 *   paytrack-cli payslip view --id=<id>
 * ============================================================================
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Helper to parse CLI arguments and flag values
 */
function getFlag(args, flagName) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === `--${flagName}` && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith(`--${flagName}=`)) {
      return arg.slice(flagName.length + 3);
    }
  }
  return null;
}

/**
 * Connect to or initialize SQLite database
 */
function connectDb() {
  const customPath = process.env.PAYTRACK_DB_PATH;
  if (customPath) {
    if (!fs.existsSync(customPath)) {
      console.error(`Error: Database file not found at ${customPath}`);
      process.exit(1);
    }
    try {
      const db = new DatabaseSync(customPath);
      db.exec('PRAGMA foreign_keys = ON;');
      return db;
    } catch (err) {
      console.error(`Error: Unable to open database at ${customPath}: ${err.message}`);
      process.exit(1);
    }
  }

  const defaultDbPath = path.resolve(PROJECT_ROOT, 'database', 'paytrack.sqlite');
  try {
    const isNew = !fs.existsSync(defaultDbPath);
    const db = new DatabaseSync(defaultDbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    if (isNew) {
      const schemaPath = path.resolve(PROJECT_ROOT, 'database', 'schema.sql');
      const triggersPath = path.resolve(PROJECT_ROOT, 'database', 'triggers.sql');
      const seedPath = path.resolve(PROJECT_ROOT, 'database', 'seed.sql');
      if (fs.existsSync(schemaPath)) db.exec(fs.readFileSync(schemaPath, 'utf8'));
      if (fs.existsSync(triggersPath)) db.exec(fs.readFileSync(triggersPath, 'utf8'));
      if (fs.existsSync(seedPath)) db.exec(fs.readFileSync(seedPath, 'utf8'));
    }
    return db;
  } catch (err) {
    console.error(`Error: Unable to initialize default database at ${defaultDbPath}: ${err.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`PayTrack CLI - Enterprise Attendance & Payroll Management
Usage: paytrack-cli [command] [options]

Commands:
  employees list                                    List all employees
  attendance punch --employee-id=<id> --status=<s>  Punch attendance record
  reports attendance --month=<m> --year=<y>         Monthly attendance summary report
  payslip view --id=<id>                            View payslip by ID
  --help                                            Show this help message
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const [cmd, subcmd] = args;

  // Command: employees list
  if (cmd === 'employees' && subcmd === 'list') {
    const db = connectDb();
    const rows = db.prepare(`
      SELECT employee_id, first_name, last_name, department, system_role
      FROM Employee
      ORDER BY employee_id
    `).all();

    console.log('Employee Directory:');
    for (const r of rows) {
      console.log(`${r.employee_id} | ${r.first_name} ${r.last_name} | ${r.department} | ${r.system_role}`);
    }
    process.exit(0);
  }

  // Command: attendance punch --employee-id=<id> --status=<status>
  if (cmd === 'attendance' && subcmd === 'punch') {
    const empIdStr = getFlag(args, 'employee-id') || getFlag(args, 'id');
    if (!empIdStr) {
      console.error('Error: Missing mandatory --employee-id parameter.');
      process.exit(1);
    }
    const empId = Number(empIdStr);
    if (!Number.isInteger(empId) || empId <= 0) {
      console.error(`Error: Invalid employee ID: "${empIdStr}". ID must be a positive integer.`);
      process.exit(1);
    }

    const status = (getFlag(args, 'status') || 'PRESENT').toUpperCase();
    const date = getFlag(args, 'date') || new Date().toISOString().slice(0, 10);
    const checkIn = getFlag(args, 'check-in') || '09:00:00';
    const checkOut = getFlag(args, 'check-out') || '17:30:00';
    const hours = Number(getFlag(args, 'hours')) || 8.0;
    const ot = Number(getFlag(args, 'overtime')) || 0.0;

    const db = connectDb();
    try {
      db.prepare(`
        INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked, overtime_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(empId, date, status, checkIn, checkOut, hours, ot);
      console.log(`Attendance punched successfully for today`);
      process.exit(0);
    } catch (err) {
      console.error(`Error: Failed to record attendance: ${err.message}`);
      process.exit(1);
    }
  }

  // Command: reports attendance --month=<m> --year=<y>
  if (cmd === 'reports' && subcmd === 'attendance') {
    let month = getFlag(args, 'month') || '8';
    let year = getFlag(args, 'year') || '2026';

    // Handle malformed or date flag gracefully (e.g. --date=invalid)
    const dateFlag = getFlag(args, 'date');
    if (dateFlag && /^\d{4}-\d{2}/.test(dateFlag)) {
      const parts = dateFlag.split('-');
      year = parts[0];
      month = String(Number(parts[1]));
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    const cleanMonth = isNaN(monthNum) ? 8 : monthNum;
    const cleanYear = isNaN(yearNum) ? 2026 : yearNum;
    const monthPad = String(cleanMonth).padStart(2, '0');

    const db = connectDb();
    const rows = db.prepare(`
      SELECT 
        e.employee_id,
        e.first_name || ' ' || e.last_name as name,
        COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days
      FROM Employee e
      LEFT JOIN Attendance a ON e.employee_id = a.employee_id 
        AND strftime('%m', a.attendance_date) = ? 
        AND strftime('%Y', a.attendance_date) = ?
      GROUP BY e.employee_id
      ORDER BY e.employee_id
    `).all(monthPad, String(cleanYear));

    console.log(`Monthly Attendance Summary Report (Month: ${cleanMonth}, Year: ${cleanYear})`);
    console.log('Emp ID | Name | Present | Absent');
    for (const r of rows) {
      console.log(`${r.employee_id} | ${r.name} | ${r.present_days} | ${r.absent_days}`);
    }
    process.exit(0);
  }

  // Command: payslip view --id=<id>
  if (cmd === 'payslip' && subcmd === 'view') {
    const idStr = getFlag(args, 'id');
    if (!idStr) {
      console.error('Error: Missing required --id parameter. Run paytrack-cli payslip view --id=<id>');
      process.exit(1);
    }

    if (!/^\d+$/.test(idStr)) {
      console.error(`Error: Non-numeric payslip ID: "${idStr}". ID must be a valid integer.`);
      process.exit(1);
    }

    const id = parseInt(idStr, 10);
    const db = connectDb();
    const slip = db.prepare(`
      SELECT p.*, e.first_name, e.last_name, e.department, e.role
      FROM Payroll p
      JOIN Employee e ON p.employee_id = e.employee_id
      WHERE p.payroll_id = ?
    `).get(id);

    if (!slip) {
      console.error(`Error: Payslip with ID ${id} not found.`);
      process.exit(1);
    }

    console.log('Detailed Payslip');
    console.log(`Employee: ${slip.first_name} ${slip.last_name}`);
    console.log(`Department: ${slip.department} (${slip.role})`);
    console.log(`Period: ${slip.pay_period_month}/${slip.pay_period_year}`);
    console.log(`Gross Pay: Rs ${Number(slip.gross_salary).toLocaleString('en-IN')}`);
    console.log(`Tax Deduction (TDS): Rs ${Number(slip.tax_deduction).toLocaleString('en-IN')}`);
    console.log(`Net Pay: Rs ${Number(slip.net_salary).toLocaleString('en-IN')}`);
    console.log(`Status: ${slip.status}`);
    process.exit(0);
  }

  // Unknown command
  console.error(`Error: Unknown command "${cmd}${subcmd ? ' ' + subcmd : ''}". Run paytrack-cli --help for usage.`);
  process.exit(1);
}

main();
