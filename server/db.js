/**
 * Thin helpers over a single `node:sqlite` DatabaseSync connection.
 *
 * node:sqlite is synchronous and every request handler runs to completion
 * before the event loop yields, which is what makes one shared connection
 * safe here: no two handlers can interleave statements on it.
 */
import { DatabaseSync } from 'node:sqlite';

/** Opens a handle with the pragmas the API relies on. */
export function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  configureConnection(db, dbPath !== ':memory:');
  return db;
}

export function configureConnection(db, onDisk) {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (onDisk) db.exec('PRAGMA journal_mode = WAL');
}

export function registerApiFunctions(db) {
  // reports.sql documents that the API must provide current_month() for its
  // parameterised month-window view; a statement cannot take '?' as a name.
  const monthGetter = { current: () => new Date().toISOString().slice(0, 7) };
  db.function('current_month', { deterministic: false }, () => monthGetter.current());
  db.function('fn_is_registered', { deterministic: true }, (name) =>
    ['fn_has_permission', 'fn_session_is_valid', 'current_month', 'fn_is_registered'].includes(String(name)) ? 1 : 0);
  // database/security.sql names the owner column perm_employee_id; the built-in
  // fallback view names it granted_employee_id. Resolve it once per connection.
  const viewColumns = db.prepare('PRAGMA table_info(vw_effective_permissions)').all().map((r) => r.name);
  const ownerColumn = viewColumns.includes('perm_employee_id')
    ? 'perm_employee_id'
    : viewColumns.includes('granted_employee_id') ? 'granted_employee_id' : 'employee_id';
  db.function('fn_has_permission', { deterministic: false }, (employeeId, permission) => {
    const row = db
      .prepare(`SELECT 1 AS ok FROM vw_effective_permissions WHERE ${ownerColumn} = ? AND permission_code = ? LIMIT 1`)
      .get(Number(employeeId), String(permission));
    return row ? 1 : 0;
  });
  return monthGetter;
}

const hasColumnCache = new WeakMap();

export function hasColumn(db, table, column) {
  let byTable = hasColumnCache.get(db);
  if (!byTable) {
    byTable = new Map();
    hasColumnCache.set(db, byTable);
  }
  if (!byTable.has(table)) {
    byTable.set(table, new Set(db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((r) => r.name)));
  }
  return byTable.get(table).has(column);
}

export function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

export function hasView(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = ?").get(name));
}

/** Double-quotes an identifier we control (never user input). */
export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Runs `fn` inside BEGIN IMMEDIATE. Any throw rolls the whole batch back, so a
 * failure half-way through cannot leave partial rows behind.
 */
export function withImmediateTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // A failed BEGIN (e.g. lock timeout) has nothing to roll back.
    }
    throw err;
  }
}

export function all(stmt, ...params) {
  return stmt.all(...params);
}
