/**
 * Route table and request pipeline.
 *
 * Every route declares the minimum role it needs; the pipeline resolves the
 * bearer session first (so a bad token is always 401, whatever the role check
 * would have said), then the role check runs before any row is read. That is
 * what keeps "row exists" invisible: an EMPLOYEE asking for someone else's
 * payslip is rejected before the lookup, identically for existing and missing ids.
 */
import { ApiError, forbidden, unauthenticated } from './errors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerEmployeeRoutes } from './routes/employees.js';
import { registerAttendanceRoutes } from './routes/attendance.js';
import { registerPayrollRoutes } from './routes/payroll.js';
import { registerReportRoutes } from './routes/reports.js';

/** role: 'public' | 'any' | 'staff' | 'admin' */
function routes() {
  const list = [];
  const add = (role, method, path, handler) => list.push({ role, method, path: compile(path), handler: guarded(role, handler) });
  registerAuthRoutes(add);
  registerEmployeeRoutes(add);
  registerAttendanceRoutes(add);
  registerPayrollRoutes(add);
  registerReportRoutes(add);
  return list;
}

function compile(pattern) {
  const keys = [];
  const source = pattern.replace(/\/:([A-Za-z_]+)/g, (_, key) => {
    keys.push(key);
    return '/([^/]+)';
  });
  return { source: new RegExp(`^${source}$`), keys, pattern };
}

function matches(route, pathname) {
  const m = route.path.source.exec(pathname);
  if (!m) return null;
  const params = {};
  route.path.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
  return params;
}

/** Lets HEAD fall through to its GET handler; the HTTP layer drops the body. */
function compatible(method, routeMethod) {
  return method === routeMethod || (method === 'HEAD' && routeMethod === 'GET');
}

function guarded(role, handler) {
  return (ctx) => {
    if (role !== 'public') {
      if (!ctx.user) throw unauthenticated();
      if (role === 'staff' && !ctx.user.isStaff) throw forbidden('This action requires staff (ADMIN or HR) access');
      if (role === 'admin' && ctx.user.systemRole !== 'ADMIN') throw forbidden('This action requires ADMIN access');
    }
    return handler(ctx);
  };
}

export function createRouter() {
  const table = routes();
  return {
    find(method, pathname) {
      let pathMatched = false;
      for (const route of table) {
        const params = matches(route, pathname);
        if (!params) continue;
        pathMatched = true;
        if (!compatible(method, route.method)) continue;
        return { route, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    }
  };
}

export { ApiError };
