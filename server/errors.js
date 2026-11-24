/**
 * API error types. Every throwable the router knows about becomes one of these,
 * so the HTTP layer never has to translate raw SQLite messages itself.
 */

export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  DB_CONSTRAINT: 400,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500
};

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code] || 500;
    if (details !== undefined) this.details = details;
  }
}

export const unauthenticated = (message = 'Authentication required') => new ApiError('UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action') => new ApiError('FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new ApiError('NOT_FOUND', message);
export const conflict = (message) => new ApiError('CONFLICT', message);

export function validationError(message, details) {
  return new ApiError('VALIDATION_ERROR', message, details);
}

/**
 * Maps SQLite/Node errors onto contract codes.
 *
 * Order matters: constraint errors are checked before the generic message
 * fallbacks, because a trigger's RAISE(ABORT, 'Error: ...') surfaces as a
 * plain SqliteError without an error code. `triggerOverride` replaces the
 * result of a constraint failure when the caller knows a specific cause (the
 * payroll generator uses it to report an already-finalised period as 409).
 */
export function fromDatabaseError(err, { triggerOverride } = {}) {
  if (err instanceof ApiError) return err;
  const message = String(err?.message || '');
  const sqliteCode = String(err?.code || err?.errcode || '');

  // SQLITE_CONSTRAINT is 19. RAISE(ABORT) surfaces as constraint errcode 19
  // with the generic code name ERR_SQLITE_ERROR, so the errcode decides.
  const errcode = Number(err?.errcode);
  const constraintFailed = sqliteCode.includes('SQLITE_CONSTRAINT') || errcode === 19;
  if (triggerOverride && constraintFailed) return triggerOverride;

  // Trigger aborts carry their business message verbatim, per the contract.
  if (/^Error: /.test(message)) return new ApiError('DB_CONSTRAINT', message);

  if (constraintFailed || /constraint failed/i.test(message)) {
    if (/UNIQUE constraint failed/i.test(message)) {
      return new ApiError('DB_CONSTRAINT', 'A record with the same unique values already exists', { sqlite: message });
    }
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      return new ApiError('DB_CONSTRAINT', 'Referenced record does not exist', { sqlite: message });
    }
    if (/CHECK constraint failed/i.test(message)) {
      return new ApiError('DB_CONSTRAINT', 'A value failed a database check constraint', { sqlite: message });
    }
    return new ApiError('DB_CONSTRAINT', message);
  }

  if (/no such (table|column|view|function)/i.test(message) || /cannot start a transaction/i.test(message)) {
    return new ApiError('INTERNAL', 'The database is not in a usable state');
  }

  return new ApiError('INTERNAL', 'Internal server error');
}
