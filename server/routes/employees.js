/**
 * Employee directory and CRUD.
 *
 * - GET /employees            : staff see all; EMPLOYEE sees only self
 * - GET /employees/:id        : staff or self
 * - POST /employees           : staff only (creates Employee + active Salary)
 * - PATCH /employees/:id      : staff only
 * - DELETE /employees/:id     : ADMIN only
 *
 * The API never exposes salt/password_hash/token_hash.
 */
import { forbidden, notFound } from '../errors.js';
import { isStaff, provisionDemoLogin } from '../auth.js';
import { credentialsPolicyBlocking } from '../bootstrap.js';
import {
  requireEmail, requireEnum, requireIsoDate, requireNumber,
  requireObject, requireString, rejectUnknownFields, optionalString
} from '../validate.js';
import { toEmployee, EMPLOYEE_COLUMNS } from '../serializers.js';

const EMPLOYEE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'department', 'role', 'systemRole', 'joinDate', 'status'];
const SALARY_FIELDS = ['baseSalary', 'hra', 'allowances', 'effectiveDate'];

// camelCase API field -> Employee column
const COLUMN = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
  department: 'department',
  role: 'role',
  systemRole: 'system_role',
  joinDate: 'join_date',
  status: 'status'
};

function normalizedEmployeeField(key, value) {
  switch (key) {
    case 'email': return requireEmail(value);
    case 'systemRole': return requireEnum(value, ['ADMIN', 'HR', 'EMPLOYEE'], key);
    case 'status': return requireEnum(value, ['ACTIVE', 'INACTIVE', 'TERMINATED'], key);
    case 'joinDate': return requireIsoDate(value, key);
    case 'phone': return optionalString(value, key, { max: 50 });
    default: return requireString(value, key, { max: 100 });
  }
}

function readEmployee(db, id) {
  return db.prepare(`SELECT ${EMPLOYEE_COLUMNS} FROM Employee e WHERE e.employee_id = ?`).get(id);
}

export function registerEmployeeRoutes(add) {
  add('any', 'GET', '/api/employees', (ctx) => {
    const search = (ctx.query.get('search') || '').trim().toLowerCase();
    const department = (ctx.query.get('department') || '').trim();
    const status = (ctx.query.get('status') || '').trim();

    const where = [];
    const params = [];
    // Scope first: an EMPLOYEE can never widen this query with filters.
    if (!isStaff(ctx.user)) {
      where.push('e.employee_id = ?');
      params.push(ctx.user.employeeId);
    }
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push("(LOWER(e.first_name) LIKE ? ESCAPE '\\' OR LOWER(e.last_name) LIKE ? ESCAPE '\\' OR LOWER(e.email) LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    if (department) {
      where.push('e.department = ?');
      params.push(department);
    }
    if (status) {
      requireEnum(status, ['ACTIVE', 'INACTIVE', 'TERMINATED'], 'status');
      where.push('e.status = ?');
      params.push(status);
    }
    let sql = `SELECT ${EMPLOYEE_COLUMNS} FROM Employee e`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY e.employee_id';
    return { status: 200, data: { employees: ctx.db.prepare(sql).all(...params).map(toEmployee) } };
  });

  add('any', 'GET', '/api/employees/:id', (ctx) => {
    const id = requireNumericId(ctx.params.id, 'id');
    // Checked before the lookup so a missing id and another person's row are
    // indistinguishable to an EMPLOYEE (both 403).
    if (!isStaff(ctx.user) && id !== ctx.user.employeeId) throw forbidden('You may only view your own record');
    const row = readEmployee(ctx.db, id);
    if (!row) throw notFound('Employee not found');
    return { status: 200, data: { employee: toEmployee(row) } };
  });

  add('staff', 'POST', '/api/employees', (ctx) => {
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, [...EMPLOYEE_FIELDS, ...SALARY_FIELDS], 'create employee');

    const values = {
      first_name: requireString(body.firstName, 'firstName', { max: 100 }),
      last_name: requireString(body.lastName, 'lastName', { max: 100 }),
      email: requireEmail(body.email),
      phone: optionalString(body.phone, 'phone', { max: 50 }),
      department: requireString(body.department, 'department', { max: 100 }),
      role: requireString(body.role, 'role', { max: 100 }),
      system_role: requireEnum(body.systemRole ?? 'EMPLOYEE', ['ADMIN', 'HR', 'EMPLOYEE'], 'systemRole'),
      join_date: requireIsoDate(body.joinDate, 'joinDate'),
      status: requireEnum(body.status ?? 'ACTIVE', ['ACTIVE', 'INACTIVE', 'TERMINATED'], 'status')
    };
    const baseSalary = requireNumber(body.baseSalary, 'baseSalary', { min: 0 });
    const hra = requireNumber(body.hra ?? 0, 'hra', { min: 0 });
    const allowances = requireNumber(body.allowances ?? 0, 'allowances', { min: 0 });
    const effectiveDate = body.effectiveDate ? requireIsoDate(body.effectiveDate, 'effectiveDate') : values.join_date;

    const db = ctx.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare(`
        INSERT INTO Employee (first_name, last_name, email, phone, department, role, system_role, join_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        values.first_name, values.last_name, values.email, values.phone, values.department,
        values.role, values.system_role, values.join_date, values.status
      );
      const employeeId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO Salary (employee_id, base_salary, hra, allowances, effective_date, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(employeeId, baseSalary, hra, allowances, effectiveDate);
      // Same credential policy as the seeded directory (see bootstrap.js).
      try {
        provisionDemoLogin(db, employeeId, 'Employee@123');
      } catch (err) {
        if (!/may hold login credentials/i.test(err.message) || !credentialsPolicyBlocking(db)) throw err;
        // Phase 4's staff-only rule is in force; the hire works without a login.
      }
      db.exec('COMMIT');
      return { status: 201, data: { employee: toEmployee(readEmployee(db, employeeId)) } };
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* transaction already gone */ }
      throw err;
    }
  });

  add('staff', 'PATCH', '/api/employees/:id', (ctx) => {
    const id = requireNumericId(ctx.params.id, 'id');
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, EMPLOYEE_FIELDS, 'update employee');
    if (!readEmployee(ctx.db, id)) throw notFound('Employee not found');

    const sets = [];
    const params = [];
    for (const key of EMPLOYEE_FIELDS) {
      if (body[key] === undefined) continue;
      sets.push(`${COLUMN[key]} = ?`);
      params.push(normalizedEmployeeField(key, body[key]));
    }
    if (sets.length) {
      params.push(id);
      ctx.db.prepare(`UPDATE Employee SET ${sets.join(', ')} WHERE employee_id = ?`).run(...params);
    }
    return { status: 200, data: { employee: toEmployee(readEmployee(ctx.db, id)) } };
  });

  add('admin', 'DELETE', '/api/employees/:id', (ctx) => {
    const id = requireNumericId(ctx.params.id, 'id');
    if (id === ctx.user.employeeId) throw forbidden('You cannot delete your own employee record');
    if (!readEmployee(ctx.db, id)) throw notFound('Employee not found');
    // Attendance/Salary/Payroll cascade from the FK; AuthUser/Session go too.
    ctx.db.prepare('DELETE FROM Employee WHERE employee_id = ?').run(id);
    return { status: 200, data: { deleted: true, employeeId: id } };
  });
}

export function requireNumericId(value, field = 'id') {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw notFound(`${field} must be a numeric identifier`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound(`${field} must be a positive integer`);
  return id;
}
