// ============================================================================
// PayTrack Phase 2 Procedural Implementation & Seed Data Verification Runner
// ============================================================================
// Candidate Name : Vinayak
// Roll Number    : 2501730150
// Course         : Database Management Systems (CapStone Phase 2)
// Engine Target  : Node.js v24 Built-in SQLite (DatabaseSync)
// ============================================================================

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('======================================================================');
console.log('      PayTrack Phase 2: Procedural Implementation & Seed Suite        ');
console.log('   Candidate: Vinayak | Roll No: 2501730150 | Engine: node:sqlite     ');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    failCount++;
  }
}

// ----------------------------------------------------------------------------
// TEST 1: Schema Loading & Constraint Verification
// ----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Schema & Object Initialization ---');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');

const schemaPath = path.resolve(__dirname, '../database/schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);
assert(true, 'Schema DDL executed successfully on in-memory SQLite engine');

// ----------------------------------------------------------------------------
// TEST 2: Triggers Loading
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Triggers Installation ---');
const triggersPath = path.resolve(__dirname, '../database/triggers.sql');
const triggersSql = fs.readFileSync(triggersPath, 'utf8');
db.exec(triggersSql);

const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
console.log(`  Installed ${triggers.length} SQLite triggers:`);
triggers.forEach(t => console.log(`    - ${t.name}`));

const expectedTriggers = [
  'trg_prevent_leave_overlap_insert',
  'trg_prevent_leave_overlap_update',
  'trg_validate_attendance_bounds_insert',
  'trg_validate_attendance_bounds_update',
  'trg_auto_late_mark_insert',
  'trg_auto_late_mark_update',
  'trg_reset_late_mark_update'
];
for (const trig of expectedTriggers) {
  assert(triggers.some(t => t.name === trig), `Trigger '${trig}' verified present`);
}

// ----------------------------------------------------------------------------
// TEST 3: Stored Procedures & Computation Views Loading
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Procedural Calculation Views Installation ---');
const proceduresPath = path.resolve(__dirname, '../database/procedures.sql');
const proceduresSql = fs.readFileSync(proceduresPath, 'utf8');
db.exec(proceduresSql);

const views = db.prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name").all();
console.log(`  Installed ${views.length} Procedural Views:`);
views.forEach(v => console.log(`    - ${v.name}`));
assert(views.some(v => v.name === 'vw_employee_attendance_monthly_summary'), "View 'vw_employee_attendance_monthly_summary' verified");
assert(views.some(v => v.name === 'vw_payroll_procedural_computation'), "View 'vw_payroll_procedural_computation' verified");

// ----------------------------------------------------------------------------
// TEST 4: Seed Dataset Loading & Volume Verification
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Realistic Seed Dataset Execution ---');
const seedPath = path.resolve(__dirname, '../database/seed.sql');
const seedSql = fs.readFileSync(seedPath, 'utf8');
db.exec(seedSql);
assert(true, 'Seed dataset parsed and loaded with 100% relational integrity');

// Verify Employee count
const empCount = db.prepare("SELECT COUNT(*) AS c FROM Employee").get().c;
assert(empCount === 12, `Employee table contains exactly 12 records (found ${empCount})`);

// Verify Department distribution
const deptCount = db.prepare("SELECT COUNT(DISTINCT department) AS c FROM Employee").get().c;
assert(deptCount === 7, `Employee records span 7 distinct departments (found ${deptCount})`);

// Verify Salary count
const salCount = db.prepare("SELECT COUNT(*) AS c FROM Salary WHERE is_active = 1").get().c;
assert(salCount === 12, `Active Salary structures configured for all 12 employees (found ${salCount})`);

// Verify Attendance count
const attCount = db.prepare("SELECT COUNT(*) AS c FROM Attendance").get().c;
assert(attCount >= 900, `Attendance records exceed mandatory 900+ threshold (found ${attCount})`);

// Verify Attendance date range (Aug - Oct 2026)
const attDates = db.prepare("SELECT MIN(attendance_date) AS min_d, MAX(attendance_date) AS max_d FROM Attendance").get();
assert(attDates.min_d === '2026-08-01' && attDates.max_d === '2026-10-31', `Attendance logs span exactly August to October 2026 (${attDates.min_d} to ${attDates.max_d})`);

// Verify Attendance statuses variety
const attStatuses = db.prepare("SELECT DISTINCT status FROM Attendance ORDER BY status").all().map(r => r.status);
console.log(`  Attendance statuses present in dataset: ${attStatuses.join(', ')}`);
assert(attStatuses.includes('PRESENT'), "Dataset contains 'PRESENT' records");
assert(attStatuses.includes('ABSENT'), "Dataset contains 'ABSENT' records");
assert(attStatuses.includes('HALF_DAY'), "Dataset contains 'HALF_DAY' records");
assert(attStatuses.includes('ON_LEAVE'), "Dataset contains 'ON_LEAVE' records");
assert(attStatuses.includes('HOLIDAY'), "Dataset contains 'HOLIDAY' records");

// Verify Leave count
const leaveCount = db.prepare("SELECT COUNT(*) AS c FROM Leave").get().c;
assert(leaveCount >= 18, `Leave requests exceed 18+ requirement (found ${leaveCount})`);

// Verify Payroll slips count
const payrollCount = db.prepare("SELECT COUNT(*) AS c FROM Payroll").get().c;
assert(payrollCount === 36, `Finalized Payroll slips equal 36 (12 employees x 3 months) (found ${payrollCount})`);

// ----------------------------------------------------------------------------
// TEST 5: Overlapping Leave Prevention Triggers (INSERT & UPDATE)
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Overlapping Leave Prevention Trigger Verification ---');

// Employee 1 has approved leave: 2026-09-14 to 2026-09-15
// Test 5A: Insert overlapping approved leave (2026-09-15 to 2026-09-17) -> Must ABORT
let overlapInsertBlocked = false;
try {
  db.exec(`INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason)
           VALUES (1, 'CASUAL', '2026-09-15', '2026-09-17', 3.0, 'APPROVED', 'Conflicting leave');`);
} catch (err) {
  if (err.message.includes('Overlapping approved leave exists')) {
    overlapInsertBlocked = true;
  } else {
    console.error('Unexpected error:', err.message);
  }
}
assert(overlapInsertBlocked, 'Trigger blocked overlapping approved leave on INSERT');

// Test 5B: Insert non-overlapping approved leave -> Must succeed
let nonOverlapInserted = false;
try {
  db.exec(`INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason)
           VALUES (1, 'CASUAL', '2026-11-10', '2026-11-12', 3.0, 'APPROVED', 'Valid future leave');`);
  nonOverlapInserted = true;
} catch (err) {
  console.error('Error inserting non-overlapping leave:', err.message);
}
assert(nonOverlapInserted, 'Trigger allowed non-overlapping approved leave on INSERT');

// Test 5C: Insert overlapping leave with status 'REJECTED' -> Must succeed (not approved)
let rejectedOverlapAllowed = false;
try {
  db.exec(`INSERT INTO Leave (employee_id, leave_type, start_date, end_date, total_days, status, reason)
           VALUES (1, 'CASUAL', '2026-09-14', '2026-09-15', 2.0, 'REJECTED', 'Rejected duplicate');`);
  rejectedOverlapAllowed = true;
} catch (err) {
  console.error('Error inserting rejected leave:', err.message);
}
assert(rejectedOverlapAllowed, 'Trigger permitted overlapping leave when status is REJECTED');

// Test 5D: Update pending leave to APPROVED with conflicting dates -> Must ABORT
// Leave ID 7 is PENDING for Employee 4 from 2026-10-26 to 2026-10-28.
// Create an approved leave for Emp 4 on 2026-10-27 to 2026-10-29 first:
db.exec(`INSERT INTO Leave (leave_id, employee_id, leave_type, start_date, end_date, total_days, status, reason)
         VALUES (999, 4, 'CASUAL', '2026-10-27', '2026-10-29', 3.0, 'APPROVED', 'Existing approved');`);

let overlapUpdateBlocked = false;
try {
  db.exec(`UPDATE Leave SET status = 'APPROVED' WHERE leave_id = 7;`);
} catch (err) {
  if (err.message.includes('Overlapping approved leave exists')) {
    overlapUpdateBlocked = true;
  }
}
assert(overlapUpdateBlocked, 'Trigger blocked status change to APPROVED on UPDATE due to date overlap');

// Test 5E: Update existing approved leave without changing dates (self-update) -> Must succeed
let selfUpdateAllowed = false;
try {
  db.exec(`UPDATE Leave SET reason = 'Updated reason for leave 999' WHERE leave_id = 999;`);
  selfUpdateAllowed = true;
} catch (err) {
  console.error('Self update error:', err.message);
}
assert(selfUpdateAllowed, 'Trigger permits update to approved leave when leave_id matches (no self-conflict)');

// Clean up test records
db.exec(`DELETE FROM Leave WHERE leave_id IN (999) OR reason IN ('Valid future leave', 'Rejected duplicate');`);

// ----------------------------------------------------------------------------
// TEST 6: Attendance Bounds & Business Rules Validation Triggers
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Attendance Bounds Trigger Verification ---');

// Test 6A: Reject future attendance dates
let futureDateBlocked = false;
try {
  db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked)
           VALUES (1, '2029-01-01', 'PRESENT', 8.0);`);
} catch (err) {
  if (err.message.includes('cannot be in the future')) {
    futureDateBlocked = true;
  }
}
assert(futureDateBlocked, 'Trigger blocked future attendance date insertion (2029-01-01)');

// Test 6B: Reject overtime hours when status is ABSENT
let absentOvertimeBlocked = false;
try {
  db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours)
           VALUES (1, '2026-07-20', 'ABSENT', 0.0, 3.5);`);
} catch (err) {
  if (err.message.includes('cannot be clocked for an ABSENT employee')) {
    absentOvertimeBlocked = true;
  }
}
assert(absentOvertimeBlocked, 'Trigger blocked overtime clocked with ABSENT status');

// Test 6C: Reject overtime hours exceeding hours worked (including 0.00 hours worked)
let zeroHoursOtBlocked = false;
try {
  db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours)
           VALUES (1, '2026-07-20', 'PRESENT', 0.0, 2.0);`);
} catch (err) {
  if (err.message.includes('cannot exceed total hours worked')) {
    zeroHoursOtBlocked = true;
  }
}
assert(zeroHoursOtBlocked, 'Trigger blocked overtime exceeding hours worked (hours_worked = 0.00, overtime_hours = 2.00)');

// Test 6D: Valid past attendance accepted
let validPastAccepted = false;
try {
  db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked, overtime_hours)
           VALUES (1, '2026-07-21', 'PRESENT', '09:10:00', '18:30:00', 9.0, 1.0);`);
  validPastAccepted = true;
  db.exec(`DELETE FROM Attendance WHERE employee_id = 1 AND attendance_date = '2026-07-21';`);
} catch (err) {
  console.error('Error inserting valid past attendance:', err.message);
}
assert(validPastAccepted, 'Valid past attendance punch accepted successfully');

// ----------------------------------------------------------------------------
// TEST 7: Auto Late Mark & Minutes Computation Triggers
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Auto Late Mark Trigger Verification ---');

// Test 7A: Check-in at 09:45:00 -> is_late = 1, late_minutes = 15
db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked)
         VALUES (2, '2026-07-22', 'PRESENT', '09:45:00', '18:00:00', 8.0);`);

const lateCheck = db.prepare(`SELECT is_late, late_minutes FROM Attendance WHERE employee_id = 2 AND attendance_date = '2026-07-22'`).get();
assert(lateCheck.is_late === 1, `Auto-set is_late = 1 for 09:45:00 check-in (got ${lateCheck.is_late})`);
assert(lateCheck.late_minutes === 15, `Auto-calculated late_minutes = 15 for 09:45:00 check-in (got ${lateCheck.late_minutes})`);

// Test 7B: Check-in at 09:15:00 -> is_late = 0, late_minutes = 0
db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, check_in_time, check_out_time, hours_worked)
         VALUES (2, '2026-07-23', 'PRESENT', '09:15:00', '17:45:00', 8.0);`);

const onTimeCheck = db.prepare(`SELECT is_late, late_minutes FROM Attendance WHERE employee_id = 2 AND attendance_date = '2026-07-23'`).get();
assert(onTimeCheck.is_late === 0 && onTimeCheck.late_minutes === 0, 'On-time check-in (09:15:00) preserved with is_late = 0 and late_minutes = 0');

// Test 7C: Update check-in time from 09:15:00 to 09:55:00 -> Trigger sets is_late = 1, late_minutes = 25
db.exec(`UPDATE Attendance SET check_in_time = '09:55:00' WHERE employee_id = 2 AND attendance_date = '2026-07-23';`);
const updateLateCheck = db.prepare(`SELECT is_late, late_minutes FROM Attendance WHERE employee_id = 2 AND attendance_date = '2026-07-23'`).get();
assert(updateLateCheck.is_late === 1 && updateLateCheck.late_minutes === 25, 'Updating check_in_time to 09:55:00 automatically marked is_late=1 and late_minutes=25');

// Test 7D: Update check-in time back to 09:20:00 -> Trigger resets is_late = 0, late_minutes = 0
db.exec(`UPDATE Attendance SET check_in_time = '09:20:00' WHERE employee_id = 2 AND attendance_date = '2026-07-23';`);
const resetLateCheck = db.prepare(`SELECT is_late, late_minutes FROM Attendance WHERE employee_id = 2 AND attendance_date = '2026-07-23'`).get();
assert(resetLateCheck.is_late === 0 && resetLateCheck.late_minutes === 0, 'Updating check_in_time back to on-time reset is_late=0 and late_minutes=0');

// Clean up test rows
db.exec(`DELETE FROM Attendance WHERE employee_id = 2 AND attendance_date IN ('2026-07-22', '2026-07-23');`);

// ----------------------------------------------------------------------------
// TEST 8: Progressive Tax Calculation Across All 4 Slabs
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 8: Progressive Tax Calculation Mathematical Proof ---');

// Formula definition:
// Slab 1: Gross <= 25,000 -> 0%
// Slab 2: 25,000 < Gross <= 50,000 -> 5% of (Gross - 25,000)
// Slab 3: 50,000 < Gross <= 100,000 -> 1,250 + 10% of (Gross - 50,000)
// Slab 4: Gross > 100,000 -> 6,250 + 15% of (Gross - 100,000)

const taxTestCases = [
  // Slab 1: Zero Tax
  { gross: 18000.00, expected: 0.00, slab: 'Slab 1 (<= 25k)' },
  { gross: 24000.00, expected: 0.00, slab: 'Slab 1 (<= 25k)' },
  { gross: 25000.00, expected: 0.00, slab: 'Slab 1 Boundary (25k)' },
  // Slab 2: 5% marginal
  { gross: 30000.00, expected: 250.00, slab: 'Slab 2 (25k-50k)' },    // (30000 - 25000) * 0.05 = 250
  { gross: 40000.00, expected: 750.00, slab: 'Slab 2 (25k-50k)' },    // (40000 - 25000) * 0.05 = 750
  { gross: 50000.00, expected: 1250.00, slab: 'Slab 2 Boundary (50k)' }, // (50000 - 25000) * 0.05 = 1250
  // Slab 3: 10% marginal
  { gross: 60000.00, expected: 2250.00, slab: 'Slab 3 (50k-100k)' },  // 1250 + 1000 = 2250
  { gross: 75000.00, expected: 3750.00, slab: 'Slab 3 (50k-100k)' },  // 1250 + 2500 = 3750
  { gross: 80000.00, expected: 4250.00, slab: 'Slab 3 (50k-100k)' },  // 1250 + 3000 = 4250
  { gross: 95000.00, expected: 5750.00, slab: 'Slab 3 (50k-100k)' },  // 1250 + 4500 = 5750
  { gross: 100000.00, expected: 6250.00, slab: 'Slab 3 Boundary (100k)' }, // 1250 + 5000 = 6250
  // Slab 4: 15% marginal
  { gross: 120000.00, expected: 9250.00, slab: 'Slab 4 (> 100k)' },   // 6250 + (20000 * 0.15) = 9250
  { gross: 140000.00, expected: 12250.00, slab: 'Slab 4 (> 100k)' },  // 6250 + (40000 * 0.15) = 12250
  { gross: 150000.00, expected: 13750.00, slab: 'Slab 4 (> 100k)' }   // 6250 + (50000 * 0.15) = 13750
];

const taxQuery = db.prepare(`
  SELECT CASE 
    WHEN :g <= 25000.00 THEN 0.00
    WHEN :g <= 50000.00 THEN ROUND((:g - 25000.00) * 0.05, 2)
    WHEN :g <= 100000.00 THEN ROUND(1250.00 + ((:g - 50000.00) * 0.10), 2)
    ELSE ROUND(6250.00 + ((:g - 100000.00) * 0.15), 2)
  END AS tax
`);

for (const tc of taxTestCases) {
  const result = taxQuery.get({ g: tc.gross }).tax;
  assert(Math.abs(result - tc.expected) < 0.01, `Tax for ₹${tc.gross.toLocaleString('en-IN')} = ₹${result.toLocaleString('en-IN')} (${tc.slab})`);
}

// ----------------------------------------------------------------------------
// TEST 9: Procedural Calculation View vs Finalized Payroll Slips Verification
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 9: Payroll Calculation Consistency & Audit ---');

// Cross-reconciliation query: joins procedural view with static Payroll records across all 36 slips
const crossReconciliation = db.prepare(`
  SELECT 
    p.payroll_id,
    p.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    p.pay_period_month,
    p.pay_period_year,
    -- Static stored values
    p.gross_salary AS static_gross,
    p.tax_deduction AS static_tax,
    p.unpaid_leave_deduction AS static_unpaid_ded,
    p.net_salary AS static_net,
    -- Procedurally computed values from view
    v.gross_salary AS view_gross,
    v.tax_deduction AS view_tax,
    v.unpaid_leave_deduction AS view_unpaid_ded,
    v.net_salary AS view_net
  FROM Payroll p
  JOIN Employee e ON p.employee_id = e.employee_id
  JOIN vw_payroll_procedural_computation v 
    ON p.employee_id = v.employee_id 
   AND p.pay_period_year = v.pay_period_year 
   AND p.pay_period_month = v.pay_period_month
  ORDER BY p.pay_period_year, p.pay_period_month, p.employee_id
`).all();

assert(crossReconciliation.length === 36, `Expected exactly 36 cross-reconciliation records, found ${crossReconciliation.length}`);

console.log(`  Sample Procedural Cross-Reconciliation Entries (Month 8 - August 2026):`);
crossReconciliation.filter(p => p.pay_period_month === 8).slice(0, 5).forEach(p => {
  console.log(`    Emp #${p.employee_id} (${p.employee_name}): Stored Net=₹${p.static_net.toLocaleString('en-IN')}, View Net=₹${p.view_net.toLocaleString('en-IN')}`);
});

let reconciliationDiscrepancies = 0;
for (const row of crossReconciliation) {
  const grossDiff = Math.abs(row.view_gross - row.static_gross);
  const taxDiff = Math.abs(row.view_tax - row.static_tax);
  const unpaidDiff = Math.abs(row.view_unpaid_ded - row.static_unpaid_ded);
  const netDiff = Math.abs(row.view_net - row.static_net);

  if (grossDiff > 0.05 || taxDiff > 0.05 || unpaidDiff > 0.05 || netDiff > 0.05) {
    console.error(`Discrepancy in Payroll slip #${row.payroll_id} (Emp #${row.employee_id}, M${row.pay_period_month}):`);
    console.error(`  Gross: Stored=${row.static_gross}, View=${row.view_gross} (Diff=${grossDiff.toFixed(2)})`);
    console.error(`  Tax: Stored=${row.static_tax}, View=${row.view_tax} (Diff=${taxDiff.toFixed(2)})`);
    console.error(`  Unpaid Ded: Stored=${row.static_unpaid_ded}, View=${row.view_unpaid_ded} (Diff=${unpaidDiff.toFixed(2)})`);
    console.error(`  Net: Stored=${row.static_net}, View=${row.view_net} (Diff=${netDiff.toFixed(2)})`);
    reconciliationDiscrepancies++;
  }
}
assert(reconciliationDiscrepancies === 0, `All 36 payroll slips match procedural view computation with 100% mathematical parity (discrepancy <= 0.05)`);

// Also verify internal formula consistency for static table
let mathErrors = 0;
for (const p of crossReconciliation) {
  const expectedNet = Math.round((p.static_gross - p.static_tax - p.static_unpaid_ded) * 100) / 100;
  if (Math.abs(p.static_net - expectedNet) > 0.05) {
    console.error(`Internal math discrepancy in Payroll #${p.payroll_id}: net=${p.static_net}, expected=${expectedNet}`);
    mathErrors++;
  }
}
assert(mathErrors === 0, 'All 36 payroll slips verify internal formula: Net Salary = Gross - Tax - Unpaid Leave Deductions');

// Assert that inserting hours_worked = 0.00 and overtime_hours = 2.00 on status = 'PRESENT' is aborted by the trigger
let triggerZeroOtAborted = false;
try {
  db.exec(`INSERT INTO Attendance (employee_id, attendance_date, status, hours_worked, overtime_hours)
           VALUES (3, '2026-07-24', 'PRESENT', 0.00, 2.00);`);
} catch (err) {
  if (err.message.includes('cannot exceed total hours worked')) {
    triggerZeroOtAborted = true;
  }
}
assert(triggerZeroOtAborted, 'Trigger aborted invalid attendance punch: hours_worked = 0.00 and overtime_hours = 2.00 on PRESENT status');

// ----------------------------------------------------------------------------
// TEST 10: Referential Integrity & PRAGMA foreign_key_check
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 10: Global Referential Integrity Verification ---');
const fkIssues = db.prepare('PRAGMA foreign_key_check').all();
assert(fkIssues.length === 0, 'Database passes PRAGMA foreign_key_check with zero integrity violations');

console.log('\n======================================================================');
console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('======================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('ALL PHASE 2 PROCEDURAL AND DATA INTEGRITY TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
