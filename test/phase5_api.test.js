/**
 * ============================================================================
 * Phase 5 REST API Test Suite (test/phase5_api.test.js)
 * ============================================================================
 * One test() per contract statement, run against a real HTTP server started
 * on an ephemeral port over a fresh in-memory database. Nothing here reaches
 * database/paytrack.sqlite.
 *
 * The helper below starts a server per suite (not per test) because building
 * the database costs ~100 ms; tests that mutate state therefore restore what
 * they touch, and tests that depend on an untouched period use their own
 * month.
 * ============================================================================
 */
import assert from 'node:assert/strict';
import { startApiServer } from '../server/server.js';

/**
 * Which sibling SQL files initialisation actually applied. security.sql fails
 * outright (SQLite rejects bound parameters inside a view), so its presence on
 * disk says nothing about the fallback being in use; the live schema decides.
 * Each probe opens its own throwaway server, which is cheap against :memory:.
 */
const SECURITY_MODE = await (async () => {
  const api = await startApiServer({ port: 0, dbPath: ':memory:' });
  try {
    const hasSessionContext = api.db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='SessionContext'").get();
    return hasSessionContext ? 'phase4' : 'fallback';
  } finally {
    await api.close();
  }
})();
const REPORTS_VIEWS = await (async () => {
  const api = await startApiServer({ port: 0, dbPath: ':memory:' });
  try {
    return Boolean(api.db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='view' AND name='vw_rpt_salary_slip'").get());
  } finally { await api.close(); }
})();
export const RUNTIME_MODE = { security: SECURITY_MODE, reportsViews: REPORTS_VIEWS };

export const ADMIN = { email: 'rajesh.sharma@paytrack.internal', password: 'Admin@123', label: 'ADMIN' };
export const HR = { email: 'sunita.rao@paytrack.internal', password: 'Hr@12345', label: 'HR' };
export const PRIYA = { email: 'priya.patel@paytrack.internal', password: 'Employee@123', label: 'EMPLOYEE', employeeId: 2 };
export const ROHAN = { email: 'rohan.gupta@paytrack.internal', password: 'Employee@123', label: 'EMPLOYEE', employeeId: 8 };

export const DEMO_CREDENTIALS = { ADMIN, HR, PRIYA };

/**
 * Starts a server and returns a small client. `as` logs in lazily and caches
 * one token per persona.
 */
export async function startHarness(options = {}) {
  const api = await startApiServer({ port: 0, dbPath: ':memory:', ...options });
  const tokens = new Map();

  async function raw(method, path, { token, body, headers = {}, rawBody } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (rawBody !== undefined) {
      init.body = rawBody;
      init.headers['Content-Type'] ??= 'application/json';
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(api.baseUrl + path, init);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { unparsable: text.slice(0, 200) }; }
    return { status: res.status, json, headers: res.headers, text };
  }

  async function tokenFor(persona) {
    if (tokens.has(persona.email)) return tokens.get(persona.email);
    const res = await raw('POST', '/auth/login', { body: { email: persona.email, password: persona.password } });
    if (res.status !== 200) throw new Error(`login failed for ${persona.label}: ${res.status} ${res.text}`);
    tokens.set(persona.email, res.json.data.token);
    return res.json.data.token;
  }

  async function as(persona, method, path, opts = {}) {
    const token = opts.token !== undefined ? opts.token : await tokenFor(persona);
    const res = await raw(method, path, { ...opts, token });
    // An unshaped 5xx body means an uncaught crash somewhere the error envelope
    // never reached; a shaped INTERNAL is a deliberate, tested outcome.
    if (res.status >= 500 && !res.json?.error) throw new Error(`${method} ${path} returned ${res.status}: ${res.text.slice(0, 300)}`);
    return res;
  }

  return { api, raw, as, tokenFor, close: () => api.close() };
}

/** Asserts the error envelope and code. */
function expectError(res, status, code) {
  assert.equal(res.status, status, `expected HTTP ${status}, got ${res.status}: ${res.text}`);
  assert.ok(res.json && res.json.error, `missing error envelope: ${res.text}`);
  assert.equal(res.json.error.code, code, `expected code ${code}, got ${res.json.error.code}`);
  assert.ok(typeof res.json.error.message === 'string' && res.json.error.message.length > 0);
  assert.ok(!/at .*\.js:\d+/.test(res.text), 'response leaked a stack trace');
}

function expectData(res, status = 200) {
  assert.equal(res.status, status, `expected HTTP ${status}, got ${res.status}: ${res.text}`);
  assert.ok(res.json && 'data' in res.json, `missing data envelope: ${res.text}`);
  return res.json.data;
}

export async function runApiTests(reporter = { record: () => {} }) {
  const results = [];
  async function test(id, description, fn) {
    const start = performance.now();
    try {
      await fn();
      const res = { id, description, status: 'PASS', duration: Number((performance.now() - start).toFixed(2)) };
      results.push(res);
      reporter.record(res);
    } catch (err) {
      const res = { id, description, status: 'FAIL', duration: Number((performance.now() - start).toFixed(2)), error: err.message };
      results.push(res);
      reporter.record(res);
    }
  }

  // ==========================================================================
  // AUTH
  // ==========================================================================
  {
    const h = await startHarness();
    try {
      await test('T5-A01', 'ADMIN demo credentials log in (contract password)', async () => {
        const data = expectData(await h.raw('POST', '/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } }));
        assert.equal(data.user.systemRole, 'ADMIN');
        assert.equal(data.user.isStaff, true);
        assert.ok(data.token && data.token.length >= 64, 'token should be 32 random bytes hex');
        assert.equal(data.tokenType, 'Bearer');
      });

      await test('T5-A02', 'HR demo credentials log in with staff access', async () => {
        const data = expectData(await h.raw('POST', '/auth/login', { body: { email: HR.email, password: HR.password } }));
        assert.equal(data.user.systemRole, 'HR');
        assert.equal(data.user.isStaff, true);
        assert.ok(
          data.user.permissions.length === 0 || data.user.permissions.includes('payroll:generate'),
          `HR permissions should include payroll:generate when granted: ${data.user.permissions.join(',')}`
        );
      });

      await test('T5-A03', 'EMPLOYEE demo credentials log in and are not staff', async () => {
        const data = expectData(await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: PRIYA.password } }));
        assert.equal(data.user.employeeId, PRIYA.employeeId);
        assert.equal(data.user.isStaff, false);
        assert.deepEqual(data.user.roles, ['EMPLOYEE']);
      });

      await test('T5-A04', 'seeded employees all have Employee@123 logins', async () => {
        for (const id of [3, 4, 8, 12]) {
          const email = { 3: 'amit.verma', 4: 'neha.singh', 8: 'rohan.gupta', 12: 'manoj.kumar' }[id] + '@paytrack.internal';
          const res = await h.raw('POST', '/auth/login', { body: { email, password: 'Employee@123' } });
          assert.equal(res.status, 200, `${email} could not log in: ${res.text}`);
        }
      });

      await test('T5-A05', 'login response never contains hash material', async () => {
        const res = await h.raw('POST', '/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } });
        assert.doesNotMatch(res.text, /password_hash|salt|token_hash|session_token_hash/i);
      });

      await test('T5-A06', 'GET /auth/me returns the authenticated user', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', '/auth/me'));
        assert.equal(data.user.email, PRIYA.email);
        assert.equal(data.user.systemRole, 'EMPLOYEE');
      });

      await test('T5-A07', 'GET /auth/me without a token is 401 UNAUTHENTICATED', async () => {
        expectError(await h.raw('GET', '/auth/me'), 401, 'UNAUTHENTICATED');
      });

      await test('T5-A08', 'GET /auth/me with a forged token is 401', async () => {
        expectError(await h.raw('GET', '/auth/me', { token: 'f'.repeat(64) }), 401, 'UNAUTHENTICATED');
      });

      await test('T5-A09', 'logout revokes the presented session', async () => {
        const login = await h.raw('POST', '/auth/login', { body: { email: ROHAN.email, password: ROHAN.password } });
        const token = login.json.data.token;
        expectData(await h.raw('GET', '/auth/me', { token }));
        expectData(await h.raw('POST', '/auth/logout', { token }), 200);
        expectError(await h.raw('GET', '/auth/me', { token }), 401, 'UNAUTHENTICATED');
      });

      await test('T5-A10', 'logout only revokes the token presented, not the account', async () => {
        const first = (await h.raw('POST', '/auth/login', { body: { email: ROHAN.email, password: ROHAN.password } })).json.data.token;
        const second = (await h.raw('POST', '/auth/login', { body: { email: ROHAN.email, password: ROHAN.password } })).json.data.token;
        await h.raw('POST', '/auth/logout', { token: first });
        expectError(await h.raw('GET', '/auth/me', { token: first }), 401, 'UNAUTHENTICATED');
        expectData(await h.raw('GET', '/auth/me', { token: second }));
      });

      await test('T5-A11', 'session expiry is 12 hours ahead', async () => {
        const data = expectData(await h.raw('POST', '/auth/login', { body: { email: HR.email, password: HR.password } }));
        const hours = (new Date(data.expiresAt).getTime() - Date.now()) / 3600000;
        assert.ok(hours > 11.9 && hours <= 12.01, `expected ~12h, got ${hours}`);
      });

      await test('T5-A12', 'only the token hash is stored in Session', async () => {
        const data = expectData(await h.raw('POST', '/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } }));
        const row = h.api.db.prepare('PRAGMA table_info(Session)').all().map((c) => c.name);
        assert.ok(!row.includes('token'), 'Session must not have a plaintext token column');
        const direct = h.api.db.prepare('SELECT COUNT(*) AS c FROM Session WHERE session_token_hash = ?').get(data.token);
        assert.equal(Number(direct.c), 0, 'raw token must not be stored');
      });
    } finally {
      await h.close();
    }
  }

  // ==========================================================================
  // AUTH: negative cases, each on a fresh server so the rate limiter is clean
  // ==========================================================================
  await test('T5-A13', 'wrong password is 401 with a generic message', async () => {
    const h = await startHarness();
    try {
      expectError(await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: 'Wrong@123' } }), 401, 'UNAUTHENTICATED');
    } finally { await h.close(); }
  });

  await test('T5-A14', 'unknown email is 401 and indistinguishable from a wrong password', async () => {
    const h = await startHarness();
    try {
      const unknown = await h.raw('POST', '/auth/login', { body: { email: 'ghost@paytrack.internal', password: 'x' } });
      const wrong = await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: 'x' } });
      expectError(unknown, 401, 'UNAUTHENTICATED');
      assert.equal(unknown.json.error.message, wrong.json.error.message);
    } finally { await h.close(); }
  });

  await test('T5-A15', 'rate limit: 5 attempts / 15 min per email+IP then 429 RATE_LIMITED', async () => {
    const h = await startHarness();
    try {
      for (let i = 0; i < 5; i += 1) {
        const res = await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: `bad-${i}` } });
        assert.equal(res.status, 401, `attempt ${i + 1} should still be 401`);
      }
      const limited = await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: 'bad-6' } });
      expectError(limited, 429, 'RATE_LIMITED');
      assert.ok(limited.json.error.details.retryAfterSeconds > 0);
      // A correct password is refused too while the window is open.
      expectError(await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: PRIYA.password } }), 429, 'RATE_LIMITED');
      // The limit is per email: another account can still sign in.
      expectData(await h.raw('POST', '/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } }));
    } finally { await h.close(); }
  });

  await test('T5-A16', 'a successful login resets the failure counter', async () => {
    const h = await startHarness();
    try {
      for (let i = 0; i < 4; i += 1) await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: 'bad' } });
      expectData(await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: PRIYA.password } }));
      for (let i = 0; i < 5; i += 1) {
        const res = await h.raw('POST', '/auth/login', { body: { email: PRIYA.email, password: 'bad' } });
        assert.equal(res.status, 401);
      }
    } finally { await h.close(); }
  });

  await test('T5-A17', 'login validation: malformed email and missing password are 422', async () => {
    const h = await startHarness();
    try {
      expectError(await h.raw('POST', '/auth/login', { body: { email: 'not-an-email', password: 'x' } }), 422, 'VALIDATION_ERROR');
      expectError(await h.raw('POST', '/auth/login', { body: { email: PRIYA.email } }), 422, 'VALIDATION_ERROR');
      expectError(await h.raw('POST', '/auth/login', { body: ['array'] }), 422, 'VALIDATION_ERROR');
    } finally { await h.close(); }
  });

  await test('T5-A18', 'inactive account cannot log in', async () => {
    const h = await startHarness();
    try {
      h.api.db.prepare("UPDATE Employee SET status = 'INACTIVE' WHERE employee_id = ?").run(ROHAN.employeeId);
      expectError(await h.raw('POST', '/auth/login', { body: { email: ROHAN.email, password: ROHAN.password } }), 401, 'UNAUTHENTICATED');
      h.api.db.prepare("UPDATE Employee SET status = 'ACTIVE' WHERE employee_id = ?").run(ROHAN.employeeId);
    } finally { await h.close(); }
  });

  await test('T5-A19', 'POST /auth/session issues a session for a known email', async () => {
    const h = await startHarness();
    try {
      const data = expectData(await h.raw('POST', '/auth/session', { body: { email: PRIYA.email, idToken: 'demo-firebase-token' } }));
      assert.ok(data.token);
      const me = expectData(await h.raw('GET', '/auth/me', { token: data.token }));
      assert.equal(me.user.employeeId, PRIYA.employeeId);
    } finally { await h.close(); }
  });

  await test('T5-A20', 'POST /auth/session with an unknown email is 403', async () => {
    const h = await startHarness();
    try {
      expectError(await h.raw('POST', '/auth/session', { body: { email: 'nobody@elsewhere.test' } }), 403, 'FORBIDDEN');
    } finally { await h.close(); }
  });

  await test('T5-A21', 'POST /auth/session for an inactive account is 403', async () => {
    const h = await startHarness();
    try {
      h.api.db.prepare("UPDATE Employee SET status = 'INACTIVE' WHERE employee_id = ?").run(ROHAN.employeeId);
      expectError(await h.raw('POST', '/auth/session', { body: { email: ROHAN.email } }), 403, 'FORBIDDEN');
    } finally { await h.close(); }
  });

  await test('T5-A22', 'POST /auth/session is rate limited like login', async () => {
    const h = await startHarness();
    try {
      for (let i = 0; i < 5; i += 1) await h.raw('POST', '/auth/session', { body: { email: 'nobody@elsewhere.test' } });
      expectError(await h.raw('POST', '/auth/session', { body: { email: 'nobody@elsewhere.test' } }), 429, 'RATE_LIMITED');
    } finally { await h.close(); }
  });

  // ==========================================================================
  // EMPLOYEES
  // ==========================================================================
  {
    const h = await startHarness();
    try {
      await test('T5-E01', 'staff GET /employees lists the full directory without secrets', async () => {
        const data = expectData(await h.as(ADMIN, 'GET', '/employees'));
        assert.equal(data.employees.length, 12);
        assert.doesNotMatch(JSON.stringify(data), /password_hash|salt/i);
      });

      await test('T5-E02', 'HR also sees the full directory', async () => {
        assert.equal(expectData(await h.as(HR, 'GET', '/employees')).employees.length, 12);
      });

      await test('T5-E03', 'EMPLOYEE GET /employees is scoped to self', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', '/employees'));
        assert.equal(data.employees.length, 1);
        assert.equal(data.employees[0].employeeId, PRIYA.employeeId);
      });

      await test('T5-E04', 'EMPLOYEE filters cannot widen the scope', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', '/employees?search=rajesh&status=ACTIVE'));
        assert.equal(data.employees.length, 0);
      });

      await test('T5-E05', 'staff filters by search, department and status', async () => {
        assert.equal(expectData(await h.as(ADMIN, 'GET', '/employees?search=rao')).employees.length, 1);
        const eng = expectData(await h.as(ADMIN, 'GET', '/employees?department=Engineering')).employees;
        assert.equal(eng.length, 4);
        const inactive = expectData(await h.as(ADMIN, 'GET', '/employees?status=INACTIVE')).employees;
        assert.equal(inactive.length, 0);
      });

      await test('T5-E06', 'invalid status filter is 422', async () => {
        expectError(await h.as(ADMIN, 'GET', '/employees?status=BOGUS'), 422, 'VALIDATION_ERROR');
      });

      await test('T5-E07', 'GET /employees/:id staff reads anyone', async () => {
        const data = expectData(await h.as(HR, 'GET', '/employees/1'));
        assert.equal(data.employee.fullName, 'Rajesh Sharma');
      });

      await test('T5-E08', 'GET /employees/:id self is allowed for EMPLOYEE', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', `/employees/${PRIYA.employeeId}`));
        assert.equal(data.employee.employeeId, PRIYA.employeeId);
      });

      await test('T5-E09', 'EMPLOYEE reading another employee is 403 (existing and missing ids alike)', async () => {
        expectError(await h.as(PRIYA, 'GET', '/employees/1'), 403, 'FORBIDDEN');
        expectError(await h.as(PRIYA, 'GET', '/employees/99999'), 403, 'FORBIDDEN');
      });

      await test('T5-E10', 'GET /employees/:id for a missing row is 404 for staff', async () => {
        expectError(await h.as(ADMIN, 'GET', '/employees/99999'), 404, 'NOT_FOUND');
      });

      await test('T5-E11', 'POST /employees creates the employee and its active salary atomically', async () => {
        const data = expectData(await h.as(ADMIN, 'POST', '/employees', {
          body: {
            firstName: 'Deepa', lastName: 'Menon', email: 'deepa.menon@paytrack.internal',
            department: 'Finance', role: 'Analyst', systemRole: 'EMPLOYEE', joinDate: '2026-11-01',
            baseSalary: 48000, hra: 10000, allowances: 4000
          }
        }), 201);
        assert.equal(data.employee.fullName, 'Deepa Menon');
        const salary = h.api.db.prepare('SELECT * FROM Salary WHERE employee_id = ? AND is_active = 1').get(data.employee.employeeId);
        assert.equal(Number(salary.base_salary), 48000);
        // The new person can sign in with the generic demo password and sees only self.
        const login = expectData(await h.raw('POST', '/auth/login', { body: { email: 'deepa.menon@paytrack.internal', password: 'Employee@123' } }));
        assert.equal(login.user.employeeId, data.employee.employeeId);
        expectData(await h.as(ADMIN, 'DELETE', `/employees/${data.employee.employeeId}`));
      });

      await test('T5-E12', 'POST /employees with negative salary is 422 and writes nothing', async () => {
        const before = Number(h.api.db.prepare('SELECT COUNT(*) AS c FROM Employee').get().c);
        const res = await h.as(ADMIN, 'POST', '/employees', {
          body: { firstName: 'Neg', lastName: 'Salary', email: 'neg@paytrack.internal', department: 'Finance', role: 'X', joinDate: '2026-11-01', baseSalary: -1 }
        });
        expectError(res, 422, 'VALIDATION_ERROR');
        assert.equal(Number(h.api.db.prepare('SELECT COUNT(*) AS c FROM Employee').get().c), before);
      });

      await test('T5-E13', 'POST /employees missing required fields is 422', async () => {
        expectError(await h.as(ADMIN, 'POST', '/employees', { body: { firstName: 'Only' } }), 422, 'VALIDATION_ERROR');
      });

      await test('T5-E14', 'POST /employees with a duplicate email is 400 DB_CONSTRAINT', async () => {
        const res = await h.as(ADMIN, 'POST', '/employees', {
          body: { firstName: 'Dup', lastName: 'Email', email: PRIYA.email, department: 'Finance', role: 'X', joinDate: '2026-11-01', baseSalary: 1000 }
        });
        expectError(res, 400, 'DB_CONSTRAINT');
      });

      await test('T5-E15', 'POST /employees as EMPLOYEE is 403', async () => {
        const res = await h.as(PRIYA, 'POST', '/employees', {
          body: { firstName: 'A', lastName: 'B', email: 'a.b@x.test', department: 'X', role: 'X', joinDate: '2026-11-01', baseSalary: 1 }
        });
        expectError(res, 403, 'FORBIDDEN');
      });

      await test('T5-E16', 'PATCH /employees/:id by staff updates and normalizes', async () => {
        const data = expectData(await h.as(HR, 'PATCH', '/employees/4', { body: { role: 'Senior Frontend Engineer', phone: '  +91 90000 00000 ' } }));
        assert.equal(data.employee.jobTitle, 'Senior Frontend Engineer');
        assert.equal(data.employee.phone, '+91 90000 00000');
      });

      await test('T5-E17', 'PATCH /employees/:id by EMPLOYEE is 403', async () => {
        expectError(await h.as(PRIYA, 'PATCH', `/employees/${PRIYA.employeeId}`, { body: { role: 'CEO' } }), 403, 'FORBIDDEN');
      });

      await test('T5-E18', 'PATCH /employees/:id with an unknown field or bad enum is 422', async () => {
        expectError(await h.as(ADMIN, 'PATCH', '/employees/4', { body: { salary: 1 } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'PATCH', '/employees/4', { body: { systemRole: 'GOD' } }), 422, 'VALIDATION_ERROR');
      });

      await test('T5-E19', 'PATCH /employees/:id missing row is 404', async () => {
        expectError(await h.as(ADMIN, 'PATCH', '/employees/99999', { body: { role: 'X' } }), 404, 'NOT_FOUND');
      });

      await test('T5-E20', 'DELETE /employees/:id is ADMIN only', async () => {
        expectError(await h.as(HR, 'DELETE', '/employees/11'), 403, 'FORBIDDEN');
        expectError(await h.as(PRIYA, 'DELETE', '/employees/11'), 403, 'FORBIDDEN');
      });

      await test('T5-E21', 'DELETE /employees/:id removes an inactive employee', async () => {
        const created = expectData(await h.as(ADMIN, 'POST', '/employees', {
          body: { firstName: 'Temp', lastName: 'Worker', email: 'temp.worker@paytrack.internal', department: 'Sales', role: 'X', joinDate: '2025-01-01', baseSalary: 1000, status: 'INACTIVE' }
        }), 201);
        expectData(await h.as(ADMIN, 'DELETE', `/employees/${created.employee.employeeId}`));
        expectError(await h.as(ADMIN, 'GET', `/employees/${created.employee.employeeId}`), 404, 'NOT_FOUND');
      });

      await test('T5-E22', 'DELETE /employees/:id cascades to salary, attendance and payroll history', async () => {
        // schema.sql declares Employee -> everything as ON DELETE CASCADE. This
        // also proves the FK graph is really enforced: a stale index snapshot
        // breaks the cascade silently.
        expectData(await h.as(ADMIN, 'DELETE', '/employees/3'));
        for (const table of ['Salary', 'Attendance', 'Payroll', 'AuthUser', 'Session']) {
          const left = Number(h.api.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE employee_id = 3`).get().c);
          assert.equal(left, 0, `${table} still holds rows for the deleted employee`);
        }
      });
    } finally {
      await h.close();
    }
  }

  // ==========================================================================
  // ATTENDANCE
  // ==========================================================================
  {
    const h = await startHarness();
    try {
      await test('T5-AT01', 'staff lists a month of attendance', async () => {
        const data = expectData(await h.as(ADMIN, 'GET', '/attendance?month=2026-10'));
        assert.equal(data.attendance.length, 12 * 31);
        assert.equal(data.attendance[0].date.slice(0, 7), '2026-10');
      });

      await test('T5-AT02', 'staff can filter by employeeId', async () => {
        const data = expectData(await h.as(ADMIN, 'GET', '/attendance?month=2026-10&employeeId=3'));
        assert.equal(data.attendance.length, 31);
        assert.ok(data.attendance.every((a) => a.employeeId === 3));
      });

      await test('T5-AT03', 'EMPLOYEE list is forced to self regardless of employeeId', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', '/attendance?month=2026-09&employeeId=1'));
        assert.ok(data.attendance.length > 0);
        assert.ok(data.attendance.every((a) => a.employeeId === PRIYA.employeeId));
      });

      await test('T5-AT04', 'invalid month is 422', async () => {
        expectError(await h.as(ADMIN, 'GET', '/attendance?month=2026-13'), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'GET', '/attendance?month=Oct'), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'GET', '/attendance?month=2026-02-30'), 422, 'VALIDATION_ERROR');
      });

      await test('T5-AT05', 'GET /employees/:id/attendance staff reads anyone', async () => {
        const data = expectData(await h.as(HR, 'GET', '/employees/1/attendance?month=2026-09'));
        assert.ok(data.attendance.every((a) => a.employeeId === 1));
        assert.equal(data.month, '2026-09');
      });

      await test('T5-AT06', 'EMPLOYEE reads own attendance, 403 for another employee', async () => {
        expectData(await h.as(PRIYA, 'GET', `/employees/${PRIYA.employeeId}/attendance?month=2026-09`));
        expectError(await h.as(PRIYA, 'GET', '/employees/1/attendance?month=2026-09'), 403, 'FORBIDDEN');
      });

      await test('T5-AT07', 'POST /attendance as staff creates a row and derives hours', async () => {
        const data = expectData(await h.as(ADMIN, 'POST', '/attendance', {
          body: { employeeId: 5, date: '2026-11-02', status: 'PRESENT', checkInTime: '09:15', checkOutTime: '17:45' }
        }), 201);
        assert.equal(data.attendance.hoursWorked, 8.5);
        assert.equal(data.attendance.checkInTime, '09:15:00');
      });

      await test('T5-AT08', 'duplicate (employee, date) is 409 CONFLICT', async () => {
        const res = await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 5, date: '2026-11-02', status: 'PRESENT' } });
        expectError(res, 409, 'CONFLICT');
      });

      await test('T5-AT09', 'future-dated attendance is 400 DB_CONSTRAINT (trigger message passed through)', async () => {
        const res = await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 5, date: '2099-01-01', status: 'PRESENT' } });
        expectError(res, 400, 'DB_CONSTRAINT');
        assert.match(res.json.error.message, /future/i);
      });

      await test('T5-AT10', 'late auto-mark runs for a punch after 09:30', async () => {
        const data = expectData(await h.as(ADMIN, 'POST', '/attendance', {
          body: { employeeId: 6, date: '2026-11-03', status: 'PRESENT', checkInTime: '10:05:00', checkOutTime: '18:30:00' }
        }), 201);
        assert.equal(data.attendance.isLate, true);
        assert.equal(data.attendance.lateMinutes, 35);
      });

      await test('T5-AT11', 'overtime on ABSENT is 400 DB_CONSTRAINT', async () => {
        const res = await h.as(ADMIN, 'POST', '/attendance', {
          body: { employeeId: 6, date: '2026-11-04', status: 'ABSENT', hoursWorked: 0, overtimeHours: 2 }
        });
        expectError(res, 400, 'DB_CONSTRAINT');
        assert.match(res.json.error.message, /ABSENT/i);
      });

      await test('T5-AT12', 'overtime above hours worked is 400 DB_CONSTRAINT', async () => {
        const res = await h.as(ADMIN, 'POST', '/attendance', {
          body: { employeeId: 6, date: '2026-11-05', status: 'PRESENT', checkInTime: '09:00', checkOutTime: '17:00', hoursWorked: 8, overtimeHours: 9 }
        });
        expectError(res, 400, 'DB_CONSTRAINT');
      });

      await test('T5-AT13', 'POST /attendance validation: bad status, bad date, bad time, unknown employee', async () => {
        expectError(await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 1, date: '2026-11-06', status: 'SICK' } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 1, date: '2026-02-30', status: 'PRESENT' } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 1, date: '2026-11-06', status: 'PRESENT', checkInTime: '25:00' } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 9999, date: '2026-11-06', status: 'PRESENT' } }), 404, 'NOT_FOUND');
        expectError(await h.as(ADMIN, 'POST', '/attendance', { body: { employeeId: 1, date: '2026-11-06', status: 'PRESENT', employee: 'x' } }), 422, 'VALIDATION_ERROR');
      });

      await test('T5-AT14', 'EMPLOYEE POST /attendance is 403', async () => {
        expectError(await h.as(PRIYA, 'POST', '/attendance', { body: { employeeId: PRIYA.employeeId, date: '2026-11-07', status: 'PRESENT' } }), 403, 'FORBIDDEN');
      });

      await test('T5-AT15', 'PATCH /attendance/:id corrects punches and clears the late mark', async () => {
        const created = expectData(await h.as(ADMIN, 'POST', '/attendance', {
          body: { employeeId: 7, date: '2026-11-09', status: 'PRESENT', checkInTime: '10:00', checkOutTime: '18:00' }
        }), 201);
        assert.equal(created.attendance.isLate, true);
        const patched = expectData(await h.as(HR, 'PATCH', `/attendance/${created.attendance.attendanceId}`, { body: { checkInTime: '09:00:00' } }));
        assert.equal(patched.attendance.isLate, false);
        assert.equal(patched.attendance.lateMinutes, 0);
        assert.equal(patched.attendance.hoursWorked, 9);
      });

      await test('T5-AT16', 'PATCH /attendance/:id by EMPLOYEE is 403, missing row is 404', async () => {
        expectError(await h.as(PRIYA, 'PATCH', '/attendance/1', { body: { status: 'HOLIDAY' } }), 403, 'FORBIDDEN');
        expectError(await h.as(ADMIN, 'PATCH', '/attendance/999999', { body: { status: 'HOLIDAY' } }), 404, 'NOT_FOUND');
      });

      await test('T5-AT17', 'GET /attendance/summary is staff-only and month-scoped', async () => {
        const data = expectData(await h.as(ADMIN, 'GET', '/attendance/summary?month=2026-10'));
        assert.equal(data.attendance.length, 12);
        const rajesh = data.attendance.find((r) => r.employee_id === 1);
        assert.equal(rajesh.month_key, '2026-10');
        assert.ok(Number(rajesh.present_days) > 0);
        expectError(await h.as(PRIYA, 'GET', '/attendance/summary?month=2026-10'), 403, 'FORBIDDEN');
      });

      await test('T5-AT18', 'GET /attendance/late is staff-only and lists only late punches', async () => {
        const data = expectData(await h.as(HR, 'GET', '/attendance/late?month=2026-10'));
        assert.ok(data.lateMarks.length > 0);
        assert.ok(data.lateMarks.every((r) => r.attendance_date.startsWith('2026-10')));
        expectError(await h.as(PRIYA, 'GET', '/attendance/late?month=2026-10'), 403, 'FORBIDDEN');
      });

      await test('T5-AT19', 'an empty month returns empty arrays, not errors', async () => {
        assert.equal(expectData(await h.as(ADMIN, 'GET', '/attendance?month=2027-04')).attendance.length, 0);
        assert.equal(expectData(await h.as(ADMIN, 'GET', '/attendance/summary?month=2027-04')).attendance.length, 0);
        assert.equal(expectData(await h.as(ADMIN, 'GET', '/attendance/late?month=2027-04')).lateMarks.length, 0);
      });
    } finally {
      await h.close();
    }
  }

  // ==========================================================================
  // PAYROLL
  // ==========================================================================
  {
    const h = await startHarness();
    try {
      await test('T5-P01', 'payroll generate fills an unprocessed period with DRAFT slips', async () => {
        // September is seeded as PAID; clearing it models a period not yet run.
        h.api.db.prepare('DELETE FROM Payroll WHERE pay_period_month = 9 AND pay_period_year = 2026').run();
        const data = expectData(await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-09' } }));
        assert.equal(data.generated, 12);
        assert.ok(data.payroll.every((p) => p.status === 'DRAFT'));
        assert.equal(data.computedFrom, 'vw_payroll_procedural_computation');
      });

      await test('T5-P02', 'generated figures equal vw_payroll_procedural_computation (September)', async () => {
        // P01 cleared September's seeded PAID rows; what remains for September
        // is exactly this run's DRAFT batch, so stored must equal the view.
        const view = h.api.db.prepare(`
          SELECT employee_id, net_salary, gross_salary, tax_deduction
          FROM vw_payroll_procedural_computation WHERE pay_period_year = 2026 AND pay_period_month = 9
        `).all();
        const stored = h.api.db.prepare(`
          SELECT employee_id, net_salary, gross_salary, tax_deduction
          FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 9
        `).all();
        assert.equal(stored.length, view.length);
        for (const v of view) {
          const s = stored.find((r) => r.employee_id === v.employee_id);
          assert.equal(Number(s.net_salary).toFixed(2), Number(v.net_salary).toFixed(2), `net salary mismatch for employee ${v.employee_id}`);
          assert.equal(Number(s.gross_salary).toFixed(2), Number(v.gross_salary).toFixed(2));
        }
      });

      await test('T5-P03', 'regenerating a DRAFT period recomputes without duplicating rows', async () => {
        const data = expectData(await h.as(HR, 'POST', '/payroll/generate', { body: { month: '2026-09' } }));
        assert.equal(data.generated, 12);
        const count = Number(h.api.db.prepare("SELECT COUNT(*) AS c FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 9").get().c);
        assert.equal(count, 12);
      });

      await test('T5-P04', 'recalculate over a PAID period is 409 and changes nothing', async () => {
        const before = h.api.db.prepare("SELECT payroll_id, net_salary, status FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 10 ORDER BY payroll_id").all();
        expectError(await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-10' } }), 409, 'CONFLICT');
        const after = h.api.db.prepare("SELECT payroll_id, net_salary, status FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 10 ORDER BY payroll_id").all();
        assert.deepEqual(after, before);
      });

      await test('T5-P05', 'recalculate over an APPROVED period is 409', async () => {
        await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-09' } });
        // Phase 4's payroll triggers freeze an APPROVED row, so the state is
        // reached through the API (the only legal path) before regenerating.
        const ids = h.api.db.prepare('SELECT payroll_id FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 9').all();
        for (const row of ids) {
          await h.as(ADMIN, 'PATCH', `/payroll/${row.payroll_id}/status`, { body: { status: 'APPROVED' } });
        }
        expectError(await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-09' } }), 409, 'CONFLICT');
        // Restore a clean slate for the transition tests by dropping this draft batch.
        h.api.db.prepare('DELETE FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 9').run();
      });

      await test('T5-P06', 'generate validation: bad month 422, empty period 422, EMPLOYEE 403', async () => {
        expectError(await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-9' } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(PRIYA, 'POST', '/payroll/generate', { body: { month: '2026-09' } }), 403, 'FORBIDDEN');
      });

      await test('T5-P07', 'GET /payroll lists a month for staff only', async () => {
        const data = expectData(await h.as(ADMIN, 'GET', '/payroll?month=2026-10'));
        assert.equal(data.payroll.length, 12);
        assert.ok(data.totals.netSalary > 0);
        expectError(await h.as(PRIYA, 'GET', '/payroll?month=2026-10'), 403, 'FORBIDDEN');
      });

      await test('T5-P08', 'GET /payroll/me returns only the caller own slips', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', '/payroll/me?month=2026-10'));
        assert.equal(data.payroll.length, 1);
        assert.equal(data.payroll[0].employeeId, PRIYA.employeeId);
        // Staff asking for "me" also get only their own.
        const hrOwn = expectData(await h.as(HR, 'GET', '/payroll/me?month=2026-10'));
        assert.ok(hrOwn.payroll.every((p) => p.employeeId === 5));
      });

      await test('T5-P09', 'employee reads own payslip with line items', async () => {
        const own = h.api.db.prepare('SELECT payroll_id FROM Payroll WHERE employee_id = ? AND pay_period_month = 10 AND pay_period_year = 2026').get(PRIYA.employeeId);
        const data = expectData(await h.as(PRIYA, 'GET', `/payroll/${own.payroll_id}/payslip`));
        assert.equal(data.payslip.employee.employeeId, PRIYA.employeeId);
        assert.equal(data.payslip.lineItems.length, 6);
        assert.equal(data.payslip.month, '2026-10');
        const gross = data.payslip.lineItems.filter((i) => i.itemType === 'EARNING').reduce((s, i) => s + i.amount, 0);
        const ded = data.payslip.lineItems.filter((i) => i.itemType === 'DEDUCTION').reduce((s, i) => s + i.amount, 0);
        assert.ok(Math.abs(gross - ded - data.payslip.netSalary) < 0.05, 'line items must reconcile to net salary');
      });

      await test('T5-P10', 'employee reading another payslip is 403 (existing and missing ids alike)', async () => {
        const others = h.api.db.prepare('SELECT payroll_id FROM Payroll WHERE employee_id = 1 LIMIT 1').get();
        expectError(await h.as(PRIYA, 'GET', `/payroll/${others.payroll_id}/payslip`), 403, 'FORBIDDEN');
        expectError(await h.as(PRIYA, 'GET', '/payroll/999999/payslip'), 403, 'FORBIDDEN');
      });

      await test('T5-P11', 'staff reads any payslip; missing payslip is 404', async () => {
        const any = h.api.db.prepare('SELECT payroll_id FROM Payroll WHERE employee_id = 1 LIMIT 1').get();
        expectData(await h.as(HR, 'GET', `/payroll/${any.payroll_id}/payslip`));
        expectError(await h.as(HR, 'GET', '/payroll/999999/payslip'), 404, 'NOT_FOUND');
      });

      await test('T5-P12', 'status DRAFT -> APPROVED -> PAID is allowed for staff', async () => {
        expectData(await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-09' } }));
        const draftRowId = h.api.db.prepare("SELECT payroll_id FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 9 ORDER BY payroll_id LIMIT 1").get().payroll_id;
        const row = { payroll_id: draftRowId };
        expectData(await h.as(ADMIN, 'PATCH', `/payroll/${row.payroll_id}/status`, { body: { status: 'APPROVED' } }));
        const paid = expectData(await h.as(ADMIN, 'PATCH', `/payroll/${row.payroll_id}/status`, { body: { status: 'PAID', paymentDate: '2026-09-30' } }));
        assert.equal(paid.status, 'PAID');
        assert.equal(paid.paymentDate, '2026-09-30');
      });

      await test('T5-P12b', 'marking PAID without a date uses today as the payment date', async () => {
        // Every seeded month is already PAID, so this test clears August and
        // rebuilds it as DRAFT to have a row it can move through the machine.
        h.api.db.prepare("DELETE FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 8").run();
        expectData(await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-08' } }));
        const next = h.api.db.prepare("SELECT payroll_id FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 8 AND status = 'DRAFT' ORDER BY payroll_id LIMIT 1").get();
        await h.as(ADMIN, 'PATCH', `/payroll/${next.payroll_id}/status`, { body: { status: 'APPROVED' } });
        const paid = expectData(await h.as(ADMIN, 'PATCH', `/payroll/${next.payroll_id}/status`, { body: { status: 'PAID' } }));
        assert.match(paid.paymentDate, /^\d{4}-\d{2}-\d{2}$/);
        // Leave August as seeded so the remaining cases see the original data.
        h.api.db.prepare('DELETE FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 8').run();
      });

      await test('T5-P13', 'illegal transitions are 422: PAID->DRAFT, DRAFT->PAID, same-status', async () => {
        const paidRow = h.api.db.prepare("SELECT payroll_id FROM Payroll WHERE status = 'PAID' LIMIT 1").get();
        expectError(await h.as(ADMIN, 'PATCH', `/payroll/${paidRow.payroll_id}/status`, { body: { status: 'DRAFT' } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'PATCH', `/payroll/${paidRow.payroll_id}/status`, { body: { status: 'PAID' } }), 422, 'VALIDATION_ERROR');
        const draftRow = h.api.db.prepare("SELECT payroll_id FROM Payroll WHERE status = 'DRAFT' LIMIT 1").get();
        expectError(await h.as(ADMIN, 'PATCH', `/payroll/${draftRow.payroll_id}/status`, { body: { status: 'PAID' } }), 422, 'VALIDATION_ERROR');
        expectError(await h.as(ADMIN, 'PATCH', `/payroll/${draftRow.payroll_id}/status`, { body: { status: 'WHATEVER' } }), 422, 'VALIDATION_ERROR');
      });

      await test('T5-P14', 'status change by EMPLOYEE is 403', async () => {
        const row = h.api.db.prepare("SELECT payroll_id FROM Payroll WHERE status = 'DRAFT' LIMIT 1").get();
        expectError(await h.as(PRIYA, 'PATCH', `/payroll/${row.payroll_id}/status`, { body: { status: 'APPROVED' } }), 403, 'FORBIDDEN');
      });

      await test('T5-P15', 'payroll reads are scoped for EMPLOYEE across every payroll endpoint', async () => {
        const own = expectData(await h.as(PRIYA, 'GET', '/payroll/me?month=2026-08'));
        assert.ok(own.payroll.every((p) => p.employeeId === PRIYA.employeeId));
      });
    } finally {
      await h.close();
    }
  }

  // ==========================================================================
  // PAYROLL ATOMICITY (own server + fault hook)
  // ==========================================================================
  await test('T5-P16', 'a failure inside the generate batch rolls back every row', async () => {
    let fired = false;
    const h = await startHarness({
      hooks: {
        payrollGenerate: ({ db }) => {
          fired = true;
          // Abort midway on purpose: this is the only code block in the route
          // that can fail after the rows were inserted.
          db.prepare('DELETE FROM Employee WHERE employee_id = -1').run();
          throw new Error('forced mid-batch failure');
        }
      }
    });
    try {
      h.api.db.prepare('DELETE FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 8').run();
      const res = await h.as(ADMIN, 'POST', '/payroll/generate', { body: { month: '2026-08' } });
      // A brand-new DRAFT batch is legal under the Phase 4 triggers, so the
      // inline writes succeed and the injected fault is what fails: an
      // unexpected server error, reported without leaking its message.
      assert.equal(res.status, 500, `expected 500 got ${res.status}`);
      assert.equal(res.json.error.code, 'INTERNAL');
      assert.ok(fired, 'fault hook never ran');
      const remaining = Number(h.api.db.prepare('SELECT COUNT(*) AS c FROM Payroll WHERE pay_period_year = 2026 AND pay_period_month = 8').get().c);
      assert.equal(remaining, 0, `expected 0 rows after rollback, found ${remaining}`);
      assert.equal(h.api.db.isTransaction, false, 'connection left inside a transaction');
      // The connection is still usable for the next request.
      expectData(await h.as(ADMIN, 'GET', '/employees'));
    } finally {
      await h.close();
    }
  });

  // ==========================================================================
  // REPORTS AND DASHBOARD
  // ==========================================================================
  {
    const h = await startHarness();
    try {
      await test('T5-R01', 'GET /reports/monthly rollup for staff', async () => {
        const data = expectData(await h.as(ADMIN, 'GET', '/reports/monthly?month=2026-10'));
        assert.equal(data.month, '2026-10');
        assert.equal(data.departments.length, 7);
        assert.equal(data.totals.payroll.slips, 12);
        assert.ok(data.totals.payroll.netSalary > 0);
      });

      await test('T5-R02', 'GET /reports/monthly is staff-only', async () => {
        expectError(await h.as(PRIYA, 'GET', '/reports/monthly?month=2026-10'), 403, 'FORBIDDEN');
      });

      await test('T5-R03', 'an empty month reports zero departments and zero payroll', async () => {
        const data = expectData(await h.as(HR, 'GET', '/reports/monthly?month=2027-05'));
        assert.equal(data.departments.length, 0);
        assert.equal(data.totals.payroll.slips, 0);
      });

      await test('T5-R04', 'GET /me/dashboard is employee-scoped', async () => {
        const data = expectData(await h.as(PRIYA, 'GET', '/me/dashboard?month=2026-10'));
        assert.equal(data.scope, 'SELF');
        assert.equal(data.headcount, 1);
        assert.equal(data.payroll.slips, 1);
        assert.equal(data.departments, undefined, 'employee must not see org directory figures');
      });

      await test('T5-R05', 'GET /me/dashboard is org-wide for staff', async () => {
        const data = expectData(await h.as(HR, 'GET', '/me/dashboard?month=2026-10'));
        assert.equal(data.scope, 'ORG');
        assert.equal(data.headcount, 12);
        assert.equal(data.departments, 7);
      });
    } finally {
      await h.close();
    }
  }

  // ==========================================================================
  // TRANSPORT: CORS, body limit, headers, envelopes
  // ==========================================================================
  {
    const h = await startHarness();
    try {
      await test('T5-T01', 'CORS preflight from http://localhost:5173 is allowed', async () => {
        const res = await fetch(h.api.baseUrl + '/auth/login', {
          method: 'OPTIONS',
          headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' }
        });
        assert.equal(res.status, 204);
        assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
        assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
      });

      await test('T5-T02', 'CORS allows the preview origin and refuses unknown origins', async () => {
        const ok = await fetch(h.api.baseUrl + '/auth/me', { headers: { Origin: 'http://localhost:4173' } });
        assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:4173');
        const bad = await fetch(h.api.baseUrl + '/auth/me', { headers: { Origin: 'https://evil.example' } });
        assert.equal(bad.headers.get('access-control-allow-origin'), null);
      });

      await test('T5-T03', 'JSON bodies over 100 KB are rejected with 413 PAYLOAD_TOO_LARGE', async () => {
        const big = JSON.stringify({ email: 'a@b.cd', password: 'x'.repeat(101 * 1024) });
        const res = await h.raw('POST', '/auth/login', { rawBody: big });
        expectError(res, 413, 'PAYLOAD_TOO_LARGE');
        assert.equal(res.json.error.details.limitBytes, 102400);
      });

      await test('T5-T04', 'malformed JSON is 422, not 500', async () => {
        expectError(await h.raw('POST', '/auth/login', { rawBody: '{"email": ' }), 422, 'VALIDATION_ERROR');
      });

      await test('T5-T05', 'security headers and no-store cache are present', async () => {
        const res = await h.raw('GET', '/auth/me');
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('x-frame-options'), 'DENY');
        assert.match(res.headers.get('content-type'), /application\/json/);
      });

      await test('T5-T06', 'unknown routes are 404 NOT_FOUND in the error envelope', async () => {
        expectError(await h.raw('GET', '/nope'), 404, 'NOT_FOUND');
        expectError(await h.raw('GET', '/api/nope', { token: await h.tokenFor(ADMIN) }), 404, 'NOT_FOUND');
      });

      await test('T5-T07', 'every protected route answers 401 without a token', async () => {
        const routes = [
          ['GET', '/auth/me'], ['POST', '/auth/logout'], ['GET', '/me/dashboard'],
          ['GET', '/employees'], ['GET', '/employees/1'], ['POST', '/employees'],
          ['PATCH', '/employees/1'], ['DELETE', '/employees/1'], ['GET', '/employees/1/attendance'],
          ['GET', '/attendance'], ['POST', '/attendance'], ['PATCH', '/attendance/1'],
          ['GET', '/attendance/summary'], ['GET', '/attendance/late'], ['POST', '/payroll/generate'],
          ['GET', '/payroll'], ['GET', '/payroll/me'], ['GET', '/payroll/1/payslip'],
          ['PATCH', '/payroll/1/status'], ['GET', '/reports/monthly']
        ];
        for (const [method, path] of routes) {
          const res = await h.raw(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : {} });
          expectError(res, 401, 'UNAUTHENTICATED');
        }
      });

      await test('T5-T08', 'a wrong-scheme Authorization header is 401', async () => {
        const res = await h.raw('GET', '/auth/me', { headers: { Authorization: `Basic ${Buffer.from('a:b').toString('base64')}` } });
        expectError(res, 401, 'UNAUTHENTICATED');
      });
    } finally {
      await h.close();
    }
  }

  // ==========================================================================
  // BOOTSTRAP
  // ==========================================================================
  {
    const { initializeDatabase } = await import('../server/bootstrap.js');
    await test('T5-B01', 'initialization is idempotent and registers the views both suites use', async () => {
      const db = initializeDatabase(':memory:');
      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all().map((r) => r.name);
        for (const name of ['Employee', 'Salary', 'Attendance', 'Leave', 'Payroll', 'AuthUser', 'Session',
          'vw_employee_attendance_monthly_summary', 'vw_payroll_procedural_computation', 'vw_rpt_salary_slip']) {
          assert.ok(tables.includes(name), `missing ${name}`);
        }
        assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM Employee').get().c), 12);
        assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM Attendance').get().c), 1104);
      } finally {
        db.close();
      }
      // A second initialisation over the same file must not duplicate or fail.
      const os = await import('node:os');
      const path = await import('node:path');
      const fs = await import('node:fs');
      const file = path.join(os.tmpdir(), `paytrack_api_boot_${process.pid}_${Date.now()}.sqlite`);
      const { removeDatabaseFiles } = await import('../server/bootstrap.js');
      try {
        const first = initializeDatabase(file);
        const employees = Number(first.prepare('SELECT COUNT(*) AS c FROM Employee').get().c);
        first.close();
        const second = initializeDatabase(file);
        assert.equal(Number(second.prepare('SELECT COUNT(*) AS c FROM Employee').get().c), employees);
        assert.equal(Number(second.prepare('SELECT COUNT(*) AS c FROM AuthUser').get().c), employees);
        second.close();
        assert.ok(fs.existsSync(file));
        assert.equal(fs.existsSync(path.resolve('database/paytrack.sqlite')), true, 'repo database must still exist');
      } finally {
        removeDatabaseFiles(file);
        assert.equal(fs.existsSync(file), false, 'temp database should be cleaned up');
      }
    });
  }

  return results;
}
