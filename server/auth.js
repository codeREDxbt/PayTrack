/**
 * Authentication: password verification, session minting and bearer resolution.
 *
 *   password_hash = hex( SHA-256( salt || password ) )      (contract form)
 *
 * Demo credentials are seeded that way by bootstrap.js. The verifier also
 * accepts PBKDF2-SHA256 digests recorded as `pbkdf2$<iterations>$<hex>` so the
 * hashing can be upgraded without invalidating existing accounts.
 */
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LEGACY_SHA256_RE = /^[0-9a-f]{64}$/;
const PBKDF2_RE = /^pbkdf2\$(\d+)\$([0-9a-f]{64})$/;

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashPasswordSha256(password, salt) {
  return sha256Hex(Buffer.concat([Buffer.from(String(salt), 'utf8'), Buffer.from(String(password), 'utf8')]));
}

export function hashPasswordPbkdf2(password, salt, iterations = 600000) {
  const digest = pbkdf2Sync(String(password), String(salt), iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${digest}`;
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Compare anyway to keep timing independent of where the mismatch is.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyPassword(password, salt, storedHash) {
  if (typeof storedHash !== 'string' || typeof salt !== 'string') return false;
  const pbkdf2 = PBKDF2_RE.exec(storedHash);
  if (pbkdf2) {
    const iterations = Number(pbkdf2[1]);
    if (!Number.isFinite(iterations) || iterations < 1000) return false;
    return safeEqualHex(pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex'), pbkdf2[2]);
  }
  if (LEGACY_SHA256_RE.test(storedHash)) return safeEqualHex(hashPasswordSha256(password, salt), storedHash);
  return false;
}

/** 32 random bytes, hex encoded. Only the SHA-256 of this value is stored. */
export function mintSessionToken() {
  return randomBytes(32).toString('hex');
}

export function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Resolves the caller from the Authorization header.
 * Returns null when there is no token; throws UNAUTHENTICATED when the token is
 * present but unknown, revoked or expired (so bad tokens never fall through).
 */
export function resolveSession(db, token) {
  const tokenHash = sha256Hex(token);
  const row = db.prepare(`
    SELECT s.session_token_hash, s.employee_id, s.expires_at, s.revoked_at,
           au.email, au.is_active, au.system_role
    FROM Session s
    JOIN AuthUser au ON au.employee_id = s.employee_id
    WHERE s.session_token_hash = ?
  `).get(tokenHash);
  if (!row) throw new ApiError('UNAUTHENTICATED', 'Session is invalid or has expired');
  if (row.revoked_at) throw new ApiError('UNAUTHENTICATED', 'Session has been revoked');
  if (String(row.expires_at) <= nowIso()) throw new ApiError('UNAUTHENTICATED', 'Session has expired');
  if (Number(row.is_active) !== 1) throw new ApiError('UNAUTHENTICATED', 'Account is inactive');
  return buildUserIdentity(db, row.employee_id);
}

/**
 * Owner column of vw_effective_permissions. database/security.sql names it
 * perm_employee_id; the bootstrap fallback (used when that file is absent)
 * names it granted_employee_id. Read the view definition instead of assuming,
 * because guessing wrong made every login fail with "no such column".
 */
export function permissionOwnerColumn(db) {
  const columns = db.prepare('PRAGMA table_info(vw_effective_permissions)').all().map((r) => r.name);
  if (columns.includes('perm_employee_id')) return 'perm_employee_id';
  if (columns.includes('granted_employee_id')) return 'granted_employee_id';
  return 'employee_id';
}

/** Grants come from the database in both modes; nothing is hard-coded here. */
function effectivePermissions(db, employeeId, roleCode) {
  // Phase 4 flattens UserRole -> RolePermission; the fallback uses the same
  // shape under a different owner column, so resolve the column first.
  const ownerColumn = permissionOwnerColumn(db);
  const flattened = db
    .prepare(`SELECT permission_code FROM vw_effective_permissions WHERE ${ownerColumn} = ? ORDER BY permission_code`)
    .all(employeeId)
    .map((r) => r.permission_code);
  if (flattened.length) return flattened;
  // Seeded accounts carry no UserRole rows: use the role's grant list instead.
  return db
    .prepare(`
      SELECT rp.permission_code FROM RolePermission rp
      JOIN Role r ON r.role_code = rp.role_code
      WHERE r.role_code = ? ORDER BY rp.permission_code
    `)
    .all(roleCode)
    .map((r) => r.permission_code);
}

export function hasUserRoleTable(db) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='UserRole'").get());
}

/** The `user` object every auth endpoint returns. Never includes secrets. */
export function buildUserIdentity(db, employeeId) {
  const row = db.prepare(`
    SELECT au.employee_id, au.email, au.system_role, au.last_login_at,
           e.first_name, e.last_name, e.phone, e.department, e.role, e.join_date, e.status
    FROM AuthUser au
    JOIN Employee e ON e.employee_id = au.employee_id
    WHERE au.employee_id = ?
  `).get(employeeId);
  if (!row) throw new ApiError('UNAUTHENTICATED', 'Account no longer exists');
  const roles = hasUserRoleTable(db)
    ? db.prepare('SELECT role_code FROM UserRole WHERE employee_id = ? ORDER BY role_code').all(employeeId).map((r) => r.role_code)
    : [row.system_role];
  const permissions = effectivePermissions(db, employeeId, row.system_role);
  return {
    employeeId: Number(row.employee_id),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    phone: row.phone,
    department: row.department,
    jobTitle: row.role,
    systemRole: row.system_role,
    roles: roles.length ? roles : [row.system_role],
    isStaff: row.system_role === 'ADMIN' || row.system_role === 'HR',
    employeeStatus: row.status,
    joinDate: row.join_date,
    lastLoginAt: row.last_login_at,
    permissions
  };
}

/**
 * Gives a newly created active employee a login with the demo password, the
 * same rule bootstrap.js applies to the seeded directory. Returns false when
 * the account is not eligible (inactive) or already has credentials.
 */
export function provisionDemoLogin(db, employeeId, password) {
  const emp = db.prepare('SELECT employee_id, email, system_role, status FROM Employee WHERE employee_id = ?').get(employeeId);
  if (!emp || emp.status !== 'ACTIVE') return false;
  if (db.prepare('SELECT 1 AS ok FROM AuthUser WHERE employee_id = ?').get(employeeId)) return false;
  const salt = randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO AuthUser (employee_id, email, password_hash, salt, system_role, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(emp.employee_id, String(emp.email).toLowerCase(), hashPasswordSha256(password, salt), salt, emp.system_role);
  return true;
}

export function isStaff(user) {
  return user.systemRole === 'ADMIN' || user.systemRole === 'HR';
}
