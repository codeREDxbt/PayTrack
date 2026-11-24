/**
 * Auth routes: demo password login, Firebase hand-off, identity, logout.
 *
 * Both sign-in endpoints share one rate limiter (5 attempts / 15 min per
 * email+IP) and both answer a failed attempt with the same generic message, so
 * a caller cannot tell a wrong password from an unknown account.
 */
import { ApiError } from '../errors.js';
import { RateLimiter, clientIp } from '../http.js';
import {
  bearerToken,
  buildUserIdentity,
  mintSessionToken,
  nowIso,
  sha256Hex,
  verifyPassword,
  SESSION_TTL_MS
} from '../auth.js';
import { requireEmail, requireObject, requireString, rejectUnknownFields } from '../validate.js';

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const INVALID_CREDENTIALS = 'Invalid email or password';

export function createRateLimiter() {
  return new RateLimiter({ limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });
}

function enforceRateLimit(ctx, email, limiter = ctx.rateLimiter) {
  const key = `${email.toLowerCase()}|${clientIp(ctx.req)}`;
  const result = limiter.hit(key);
  if (!result.allowed) {
    throw new ApiError('RATE_LIMITED', `Too many sign-in attempts. Try again in ${result.retryAfterSeconds} seconds.`, {
      retryAfterSeconds: result.retryAfterSeconds
    });
  }
  return { key, limiter };
}

function issueSession(db, employeeId) {
  const token = mintSessionToken();
  const issuedAt = Date.now();
  db.prepare(`
    INSERT INTO Session (session_token_hash, employee_id, issued_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, NULL)
  `).run(
    sha256Hex(token),
    employeeId,
    nowIso(issuedAt),
    nowIso(issuedAt + SESSION_TTL_MS)
  );
  db.prepare('UPDATE AuthUser SET last_login_at = ? WHERE employee_id = ?').run(nowIso(issuedAt), employeeId);
  return { token, expiresAt: new Date(issuedAt + SESSION_TTL_MS).toISOString() };
}

export function registerAuthRoutes(add) {
  add('public', 'POST', '/api/auth/login', async (ctx) => {
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, ['email', 'password'], 'login');
    const email = requireEmail(body.email);
    const password = requireString(body.password, 'password', { max: 256 });
    const { key, limiter } = enforceRateLimit(ctx, email);

    const account = ctx.db.prepare(`
      SELECT au.employee_id, au.password_hash, au.salt, au.is_active, e.status
      FROM AuthUser au
      JOIN Employee e ON e.employee_id = au.employee_id
      WHERE au.email = ?
    `).get(email);

    const passwordOk = account ? verifyPassword(password, account.salt, account.password_hash) : false;
    if (!account || !passwordOk) throw new ApiError('UNAUTHENTICATED', INVALID_CREDENTIALS);
    if (Number(account.is_active) !== 1 || account.status !== 'ACTIVE') {
      throw new ApiError('UNAUTHENTICATED', INVALID_CREDENTIALS);
    }

    limiter.reset(key);
    const session = issueSession(ctx.db, account.employee_id);
    return { status: 200, data: { token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: buildUserIdentity(ctx.db, account.employee_id) } };
  });

  // Session exchange for browsers that signed in with Firebase. The demo build
  // trusts the email in the body; production MUST verify the Firebase ID token
  // server-side before this lookup (see docs/phase-5/api-reference.md).
  add('public', 'POST', '/api/auth/session', async (ctx) => {
    const body = requireObject(ctx.body);
    rejectUnknownFields(body, ['email', 'idToken'], 'session exchange');
    const email = requireEmail(body.email);
    if (body.idToken !== undefined) requireString(body.idToken, 'idToken', { max: 8192 });
    const { key, limiter } = enforceRateLimit(ctx, email);

    const account = ctx.db.prepare(`
      SELECT au.employee_id, au.is_active, e.status
      FROM AuthUser au
      JOIN Employee e ON e.employee_id = au.employee_id
      WHERE au.email = ?
    `).get(email);

    if (!account || Number(account.is_active) !== 1 || account.status !== 'ACTIVE') {
      throw new ApiError('FORBIDDEN', 'No active PayTrack account is linked to this identity');
    }
    limiter.reset(key);
    const session = issueSession(ctx.db, account.employee_id);
    return { status: 200, data: { token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: buildUserIdentity(ctx.db, account.employee_id) } };
  });

  add('any', 'GET', '/api/auth/me', (ctx) => ({ status: 200, data: { user: ctx.user } }));

  add('any', 'POST', '/api/auth/logout', (ctx) => {
    const token = bearerToken(ctx.req);
    if (token) {
      ctx.db.prepare('UPDATE Session SET revoked_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL')
        .run(nowIso(), sha256Hex(token));
    }
    return { status: 200, data: { loggedOut: true } };
  });

  add('any', 'POST', '/api/auth/session/refresh', (ctx) => {
    // Rotation: mint a new session, revoke the presented one in the same write lock.
    const token = bearerToken(ctx.req);
    if (!token) throw new ApiError('UNAUTHENTICATED', 'Session is invalid or has expired');
    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      const session = issueSession(ctx.db, ctx.user.employeeId);
      ctx.db.prepare('UPDATE Session SET revoked_at = ? WHERE session_token_hash = ?').run(nowIso(), sha256Hex(token));
      ctx.db.exec('COMMIT');
      return { status: 200, data: { token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: buildUserIdentity(ctx.db, ctx.user.employeeId) } };
    } catch (err) {
      try { ctx.db.exec('ROLLBACK'); } catch { /* nothing to undo */ }
      throw err;
    }
  });

}
