# TEST_INFRA.md — PayTrack End-to-End Testing Infrastructure

## 1. Overview & Testing Philosophy

PayTrack is verified using a rigorous **Opaque-Box (Black/Gray-Box) Testing Architecture**. Under this philosophy:
- The system is treated as an autonomous service interacting strictly through defined public contracts:
  1. **Relational Database Engine**: Direct SQL execution, DDL constraint validation, triggers, procedural functions, and `EXPLAIN QUERY PLAN` inspection.
  2. **Express REST API**: Standard HTTP requests (`GET`, `POST`, `PATCH`, `DELETE`) with JSON payloads and Bearer tokens, evaluating HTTP response codes and RBAC enforcement.
  3. **Interactive Command-Line Interface (CLI)**: Subprocess execution feeding arguments and stdin, asserting exit codes and stdout outputs.
- **Zero-Dependency Guarantee**: The testing harness and runner require zero external npm test dependencies (no Jest, Mocha, or Supertest required). It executes natively using Node.js v24 built-in modules (`node:sqlite`, `node:test`, `node:assert/strict`, `node:child_process`, and `globalThis.fetch`).
- **Complete Test Isolation & Determinism**: Every test suite runs against an ephemeral SQLite database (`:memory:` or temporary disk file) and utilizes `SAVEPOINT` transaction rollbacks, preventing any state pollution or reliance on pre-existing environment data.

---

## 2. Test Architecture & Lifecycle

```
+-----------------------------------------------------------------------------------+
|                           TEST RUNNER (test/run_e2e.js)                           |
|   - CLI Flag Parser (--tier=1,2,3,4,all, --verbose, --json)                       |
|   - Tier Dispatcher & Lifecycle Orchestrator                                      |
|   - Formatted Terminal Reporter & Exit Code Handler (0 / 1)                       |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           TEST HARNESS (test/harness.js)                          |
|   +-----------------------+ +-----------------------+ +-----------------------+   |
|   |   Database Harness    | |   API Server Harness  | |      CLI Harness      |   |
|   | - Ephemeral SQLite DB | | - Ephemeral Port (0)  | | - Child Process Spawn |   |
|   | - Schema & Seed loader| | - Native fetch Client | | - Stdin/Stdout Pipes  |   |
|   | - SAVEPOINT Rollbacks | | - RBAC Token Injector | | - Exit Code Asserter  |   |
|   +-----------------------+ +-----------------------+ +-----------------------+   |
+-----------------------------------------------------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        v                                 v                                 v
+-----------------------+ +-----------------------+ +-----------------------+
|  Tier 1: Feature Cov  | |  Tier 2: Boundaries   | |  Tier 3: Pairwise &   |
|  >=5 happy path cases | |  >=5 edge/error cases | |  Interactions         |
|  per core feature     | |  per core feature     | |  Cross-module tests   |
+-----------------------+ +-----------------------+ +-----------------------+
                                          |
                                          v
                        +-----------------------------------+
                        |    Tier 4: Real-World Scenarios   |
                        |    Full 3-month cycle, dispute,   |
                        |    promotions, penalty deductions |
                        +-----------------------------------+
```

### Execution Lifecycle
1. **Pre-flight Check**: Runner verifies Node.js version (>=24.0.0) and workspace files.
2. **Harness Initialization**: Instantiates isolated database with `PRAGMA foreign_keys = ON;`, executes `database/schema.sql`, triggers, and procedures.
3. **Optional Server Startup**: If API testing is active, spawns an ephemeral Express instance on dynamic OS port `0`.
4. **Tier Execution**: Runs requested tiers in sequential order, recording individual test pass/fail/skip statuses and durations.
5. **Teardown**: Closes ephemeral HTTP server, rolls back any active transactions, and closes/deletes temporary SQLite databases.
6. **Reporting & Exit**: Emits formatted summary report. Exits with code `0` if all tests pass, or `1` if any test fails.

---

## 3. Test File Layout

All test infrastructure files reside under `test/`:

| File | Purpose | Key Responsibilities |
|---|---|---|
| `test/run_e2e.js` | Master Test Runner | CLI argument parsing, tier dispatching, execution timing, terminal reporting, process exit codes. |
| `test/harness.js` | Test Harness & Utilities | Database lifecycle, server startup/shutdown, HTTP requests, CLI execution, custom assertions. |
| `test/tier1_features.test.js` | Tier 1: Feature Coverage | >=5 happy-path test cases per feature across all core features (50+ tests). |
| `test/tier2_boundaries.test.js` | Tier 2: Boundary & Corner Cases | >=5 edge/negative test cases per feature (constraints, triggers, RBAC security) (50+ tests). |
| `test/tier3_pairwise.test.js` | Tier 3: Cross-Feature Interactions | Pairwise combinations, state transitions, transaction rollbacks, index optimizations (16+ tests). |
| `test/tier4_realworld.test.js` | Tier 4: Real-World Scenarios | End-to-end multi-employee quarterly payroll cycle, leave dispute resolution, promotion, late mark penalties (6+ scenarios). |

---

## 4. Test Harness API Specification (`test/harness.js`)

### 4.1 Database Utilities
- **`createTestDb(options)`**:
  - `options.inMemory` (boolean, default: `true`): Creates an in-memory database (`:memory:`) or a temporary disk file.
  - `options.seed` (boolean, default: `false`): Loads realistic 3-month sample data (`database/seed.sql`).
  - `options.schemaPath` (string): Path to DDL script (`database/schema.sql`).
  - Returns: `{ db, dbPath, close, exec, query, get, run, withTx }`.
  - Guarantees: Always executes `PRAGMA foreign_keys = ON;`.
- **`withTransaction(db, testFn)`**:
  - Executes `SAVEPOINT test_sp;`.
  - Runs `await testFn(db)`.
  - Automatically executes `ROLLBACK TO SAVEPOINT test_sp; RELEASE SAVEPOINT test_sp;` in a `finally` block.

### 4.2 Ephemeral Server Utilities
- **`startTestServer({ db, port = 0 })`**:
  - Starts backend Express app listening on dynamic port `0`.
  - Returns: `{ server, port, baseUrl, close }`.
- **`stopTestServer(server)`**:
  - Closes HTTP listener cleanly.

### 4.3 HTTP Client Helper (`apiRequest`)
- **`apiRequest(baseUrl, endpoint, options)`**:
  - `options.method`: `'GET' | 'POST' | 'PATCH' | 'DELETE'` (default: `'GET'`).
  - `options.body`: Object or string (automatically serializes to JSON).
  - `options.role`: `'ADMIN' | 'HR' | 'EMPLOYEE' | 'ANONYMOUS'`.
  - `options.employeeId`: ID injected into employee Bearer tokens.
  - Uses native `globalThis.fetch`.
  - Returns: `{ status, ok, headers, json, text }`.

### 4.4 CLI Subprocess Helper (`runCli`)
- **`runCli(args, options)`**:
  - Spawns `node cli/paytrack-cli.js <args>`.
  - Sets `PAYTRACK_DB_PATH` in child process environment.
  - Pipes `options.stdin` into stdin stream.
  - Returns Promise resolving to `{ stdout, stderr, exitCode, code }`.

### 4.5 Custom Assertions
- **`assertThrowsConstraint(db, sql, params, expectedSubstr)`**: Verifies execution throws an error matching `CHECK constraint failed`, `FOREIGN KEY constraint failed`, `UNIQUE constraint failed`, or `RAISE(ABORT)`.
- **`assertExecutionPlanUsesIndex(db, query, expectedIndexName)`**: Executes `EXPLAIN QUERY PLAN <query>` and verifies `USING INDEX <expectedIndexName>` appears in the plan.

---

## 5. Master Runner Specification (`test/run_e2e.js`)

### 5.1 Command Line Interface
```bash
# Run entire test suite across all 4 tiers
node test/run_e2e.js

# Run individual tiers
node test/run_e2e.js --tier=1
node test/run_e2e.js --tier=2
node test/run_e2e.js --tier=3
node test/run_e2e.js --tier=4

# Run with verbose assertion outputs
node test/run_e2e.js --verbose

# Run with JSON machine-readable output
node test/run_e2e.js --json
```

---

## 6. 4-Tier Test Specifications

### Tier 1: Core Feature Coverage (`test/tier1_features.test.js`)
- Minimum >= 5 test cases per core feature across 10 features (56 tests total):
  1. Feature 1: 5-Entity Relational Data Model (6 tests)
  2. Feature 2: Procedural Computations (Salary & Deductions) (6 tests)
  3. Feature 3: Progressive Tax (TDS) Slabs (5 tests)
  4. Feature 4: Attendance & Time Tracking (6 tests)
  5. Feature 5: Leave Management & Approvals (5 tests)
  6. Feature 6: Seed Dataset & Data Integrity (5 tests)
  7. Feature 7: Analytical Reports Generation (6 tests)
  8. Feature 8: B-Tree Indexing & Performance (5 tests)
  9. Feature 9: Role-Based Access Control (RBAC) (6 tests)
  10. Feature 10: ACID Transactions (6 tests)

### Tier 2: Boundary & Corner Cases (`test/tier2_boundaries.test.js`)
- Minimum >= 5 test cases per core feature across 10 features (56 tests total):
  1. Data Model Constraints (6 tests)
  2. Attendance Boundaries (6 tests)
  3. Leave Validation & Triggers (6 tests)
  4. Tax Slab Boundary Values (5 tests)
  5. Payroll Extreme Cases (6 tests)
  6. Security & RBAC Boundary Enforcements (6 tests)
  7. Transaction Rollback Under Errors (6 tests)
  8. CLI Boundary Inputs (5 tests)
  9. Report Boundary Conditions (5 tests)
  10. Data Integrity Edge Constraints (5 tests)

### Tier 3: Cross-Feature Interactions (`test/tier3_pairwise.test.js`)
- 16 Pairwise combination test cases:
  1. T3-P01: Leave Approval -> Attendance Generation
  2. T3-P02: Attendance Late-Marks -> Late Report -> Penalty Calculation
  3. T3-P03: Overtime Clocking -> Rate Computation -> Payroll Net Addition
  4. T3-P04: Salary Revision Under Transaction -> Historical Payroll Immutability
  5. T3-P05: Unpaid Leave Application -> Attendance Absence -> Payroll Loss of Pay (LOP)
  6. T3-P06: Employee Self-Punch -> HR Approval Filter -> Monthly Attendance Report
  7. T3-P07: Index Creation -> Query Plan Transition -> Benchmark Proof
  8. T3-P08: REST API Application -> Trigger Validation -> Error Code Mapping
  9. T3-P09: CLI Subprocess Execution -> Ephemeral Database -> Formatted Summary Output
  10. T3-P10: Transaction Rollback -> REST API Response -> Database State Verification
  11. T3-P11: Role Switching (HR -> Employee) -> Dynamic Route Access
  12. T3-P12: Cascade Delete on Employee -> Verify Clean Child Table Purge
  13. T3-P13: Concurrent Attendance Punches -> Unique Constraint Collision
  14. T3-P14: Half-Day Attendance + Overtime Interaction
  15. T3-P15: Holiday Calendar vs Attendance Reconciliation
  16. T3-P16: Multiple Concurrent Leave Requests -> Trigger Race Condition

### Tier 4: Real-World Workload Scenarios (`test/tier4_realworld.test.js`)
- 6 Comprehensive enterprise workflows:
  1. T4-R01: Full Quarterly Enterprise Payroll Cycle (12 employees, 3 months, 36 payslips)
  2. T4-R02: Mid-Quarter Promotion & Salary Restructuring
  3. T4-R03: Leave Conflict, Rejection, and Rescheduling Workflow
  4. T4-R04: Habitual Tardiness & Penalty Escalation Workflow
  5. T4-R05: Comprehensive RBAC Security Audit & Intrusion Attempt
  6. T4-R06: Concurrent Read/Write Performance & Query Optimization Verification

---

## 7. Quality Gate & Target Counts

| Tier | Category | Minimum Required | Target Designed | Target Status |
|---|---|---|---|---|
| **Tier 1** | Core Feature Coverage | >= 5 per feature (10 features = 50) | **56 tests** | Specified |
| **Tier 2** | Boundary & Corner Cases | >= 5 per feature (10 features = 50) | **56 tests** | Specified |
| **Tier 3** | Cross-Feature Interactions | Pairwise combinations | **16 tests** | Specified |
| **Tier 4** | Real-World Enterprise Workloads | Multi-step lifecycle scenarios | **6 scenarios** | Specified |
| **TOTAL** | Complete E2E Suite | **>= 120 tests** | **134 tests** | **Passes Quality Gate** |

---

## 8. Continuous Verification & `TEST_READY.md` Protocol

1. **Running the Suite**:
   ```bash
   node test/run_e2e.js
   ```
2. **Quality Gate Verification Criteria**:
   - Exit code must be `0`.
   - Total tests run >= 120.
   - Failed count must be `0`.
   - All 4 tiers must execute and report subtotal pass counts.
3. **Publishing `TEST_READY.md`**:
   Upon successful verification of all tests, the test orchestrator publishes `TEST_READY.md` at the project root.
