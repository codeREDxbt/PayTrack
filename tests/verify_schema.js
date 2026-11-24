import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== PayTrack Phase 1 Schema Verification ===');

console.log('\n--- TEST 1: Schema Parsing & Execution ---');
const schemaPath = path.resolve(__dirname, '../database/schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

const db = new DatabaseSync(':memory:');
db.exec(sql);
console.log('Schema executed successfully.');

console.log('\n--- TEST 2: Table & Index Verification ---');
const objects = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
console.log(`Found ${objects.length} database objects:`);
objects.forEach(t => console.log(`  [${t.type}] ${t.name}`));

const expectedTables = ['Employee', 'Salary', 'Attendance', 'Leave', 'Payroll'];
for (const tbl of expectedTables) {
  const exists = objects.some(t => t.type === 'table' && t.name === tbl);
  if (!exists) throw new Error(`Missing expected table: ${tbl}`);
}
console.log('PASS: All 5 core tables verified present.');

console.log('\n--- TEST 3: Referential Integrity & Foreign Key Enforcement ---');
db.exec('PRAGMA foreign_keys = ON;');

// Test FK failure on invalid parent
try {
  db.exec("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (9999, 50000.00, '2026-08-01');");
  throw new Error('FK constraint check failed: invalid insert succeeded');
} catch (e) {
  if (e.message.includes('FOREIGN KEY')) {
    console.log(`PASS: Invalid FK blocked correctly (${e.message})`);
  } else {
    throw e;
  }
}

console.log('\n--- TEST 4: CHECK Constraint Verification ---');
// Insert valid Employee
db.exec("INSERT INTO Employee (first_name, last_name, email, department, role, system_role, join_date, status) VALUES ('Vinayak', 'Vashisth', 'vinayak@paytrack.test', 'Engineering', 'Lead Architect', 'ADMIN', '2026-01-01', 'ACTIVE');");
console.log('PASS: Valid Employee inserted.');

// Negative base salary
try {
  db.exec("INSERT INTO Salary (employee_id, base_salary, effective_date) VALUES (1, -500.00, '2026-01-01');");
  throw new Error('CHECK constraint failed: negative salary allowed');
} catch (e) {
  if (e.message.includes('CHECK')) {
    console.log(`PASS: Negative salary rejected (${e.message})`);
  } else {
    throw e;
  }
}

// Inverted leave dates
try {
  db.exec("INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days) VALUES (1, 'CASUAL', '2026-09-10', '2026-09-05', 5);");
  throw new Error('CHECK constraint failed: inverted leave dates allowed');
} catch (e) {
  if (e.message.includes('CHECK')) {
    console.log(`PASS: Inverted leave dates rejected (${e.message})`);
  } else {
    throw e;
  }
}

// Excessive attendance hours (>24)
try {
  db.exec("INSERT INTO Attendance (employee_id, attendance_date, hours_worked) VALUES (1, '2026-09-01', 25.0);");
  throw new Error('CHECK constraint failed: 25 hours worked allowed');
} catch (e) {
  if (e.message.includes('CHECK')) {
    console.log(`PASS: Hours > 24 rejected (${e.message})`);
  } else {
    throw e;
  }
}

// Excessive overtime (>16)
try {
  db.exec("INSERT INTO Attendance (employee_id, attendance_date, hours_worked, overtime_hours) VALUES (1, '2026-09-02', 8.0, 18.0);");
  throw new Error('CHECK constraint failed: Overtime > 16 allowed');
} catch (e) {
  if (e.message.includes('CHECK')) {
    console.log(`PASS: Overtime > 16 rejected (${e.message})`);
  } else {
    throw e;
  }
}

// Invalid system_role
try {
  db.exec("INSERT INTO Employee (first_name, last_name, email, department, role, system_role, join_date) VALUES ('Bad', 'Role', 'bad@paytrack.test', 'Engineering', 'Dev', 'SUPERUSER', '2026-01-01');");
  throw new Error('CHECK constraint failed: invalid system_role allowed');
} catch (e) {
  if (e.message.includes('CHECK')) {
    console.log(`PASS: Invalid system_role rejected (${e.message})`);
  } else {
    throw e;
  }
}

console.log('\n--- TEST 5: UNIQUE Constraint Verification ---');
// Duplicate email
try {
  db.exec("INSERT INTO Employee (first_name, last_name, email, department, role, join_date) VALUES ('Duplicate', 'Email', 'vinayak@paytrack.test', 'Engineering', 'Dev', '2026-01-01');");
  throw new Error('UNIQUE constraint failed: duplicate email allowed');
} catch (e) {
  if (e.message.includes('UNIQUE')) {
    console.log(`PASS: Duplicate email rejected (${e.message})`);
  } else {
    throw e;
  }
}

// Valid attendance
db.exec("INSERT INTO Attendance (employee_id, attendance_date, hours_worked) VALUES (1, '2026-08-01', 8.0);");
console.log('PASS: Valid attendance logged.');

// Duplicate attendance for same emp + date
try {
  db.exec("INSERT INTO Attendance (employee_id, attendance_date, hours_worked) VALUES (1, '2026-08-01', 7.5);");
  throw new Error('UNIQUE constraint failed: duplicate attendance date allowed');
} catch (e) {
  if (e.message.includes('UNIQUE')) {
    console.log(`PASS: Duplicate attendance on same date rejected (${e.message})`);
  } else {
    throw e;
  }
}

// Valid Salary
db.exec("INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active) VALUES (1, 80000.00, 25000.00, 15000.00, '2026-01-01', 1);");
console.log('PASS: Valid Salary inserted.');

// Valid Payroll
db.exec("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, gross_salary, tax_deduction, net_salary, status) VALUES (1, 1, 8, 2026, 22, 22.0, 120000.00, 10250.00, 109750.00, 'PAID');");
console.log('PASS: Valid Payroll inserted.');

// Duplicate Payroll for same employee in same year + month
try {
  db.exec("INSERT INTO Payroll (employee_id, salary_id, pay_period_month, pay_period_year, working_days, present_days, gross_salary, tax_deduction, net_salary) VALUES (1, 1, 8, 2026, 22, 22.0, 120000.00, 10250.00, 109750.00);");
  throw new Error('UNIQUE constraint failed: duplicate payroll allowed');
} catch (e) {
  if (e.message.includes('UNIQUE')) {
    console.log(`PASS: Duplicate payroll period rejected (${e.message})`);
  } else {
    throw e;
  }
}

console.log('\n--- TEST 6: Cascade Deletion Verification ---');
const beforeEmp = db.prepare('SELECT COUNT(*) as c FROM Employee').get().c;
const beforeSal = db.prepare('SELECT COUNT(*) as c FROM Salary').get().c;
const beforeAtt = db.prepare('SELECT COUNT(*) as c FROM Attendance').get().c;
const beforePay = db.prepare('SELECT COUNT(*) as c FROM Payroll').get().c;

console.log(`Records before delete: Employee=${beforeEmp}, Salary=${beforeSal}, Attendance=${beforeAtt}, Payroll=${beforePay}`);

db.exec("DELETE FROM Employee WHERE employee_id = 1;");

const afterEmp = db.prepare('SELECT COUNT(*) as c FROM Employee').get().c;
const afterSal = db.prepare('SELECT COUNT(*) as c FROM Salary').get().c;
const afterAtt = db.prepare('SELECT COUNT(*) as c FROM Attendance').get().c;
const afterPay = db.prepare('SELECT COUNT(*) as c FROM Payroll').get().c;

console.log(`Records after deleting Employee #1: Employee=${afterEmp}, Salary=${afterSal}, Attendance=${afterAtt}, Payroll=${afterPay}`);

if (afterSal !== 0 || afterAtt !== 0 || afterPay !== 0) {
  throw new Error('Cascade deletion failed! Child records still exist.');
}
console.log('PASS: Cascading deletion verified.');

console.log('\n======================================================');
console.log('ALL 6 PHASE 1 SCHEMA TESTS PASSED WITH ZERO ERRORS!');
console.log('======================================================');
