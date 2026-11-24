/**
 * Request validation helpers. Every failure here is a VALIDATION_ERROR (422),
 * except constraint violations, which come from SQLite and are translated in
 * errors.js. Dates are validated on the calendar, not just by regex, because
 * SQLite's date functions silently accept 2026-02-30.
 */
import { validationError } from './errors.js';

export const ROLES = ['ADMIN', 'HR', 'EMPLOYEE'];
export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'TERMINATED'];
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY'];
export const PAYROLL_STATUSES = ['DRAFT', 'APPROVED', 'PAID'];

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireObject(body) {
  if (!isPlainObject(body)) throw validationError('Request body must be a JSON object');
  return body;
}

/** Rejects unexpected keys so typos fail loudly instead of being ignored. */
export function rejectUnknownFields(body, allowed, context) {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) throw validationError(`Unknown field(s) for ${context}`, { fields: unknown, allowed });
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function requireIsoDate(value, field) {
  if (!isValidIsoDate(value)) throw validationError(`${field} must be a valid date in YYYY-MM-DD format`, { field });
  return value;
}

/** `YYYY-MM` → { year, month, key, start, nextStart }. */
export function parseMonth(value, field = 'month', { required = true, now = new Date() } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw validationError(`${field} is required in YYYY-MM format`, { field });
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    return buildMonth(y, m);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    throw validationError(`${field} must be in YYYY-MM format`, { field });
  }
  const [year, month] = value.split('-').map(Number);
  if (year < 2000 || year > 2100) throw validationError(`${field} year is out of range`, { field });
  if (month < 1 || month > 12) throw validationError(`${field} month must be between 01 and 12`, { field });
  return buildMonth(year, month);
}

function buildMonth(year, month) {
  const pad = (n) => String(n).padStart(2, '0');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    year,
    month,
    key: `${year}-${pad(month)}`,
    start: `${year}-${pad(month)}-01`,
    nextStart: `${nextYear}-${pad(nextMonth)}-01`
  };
}

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`, { field });
  const trimmed = value.trim();
  if (trimmed.length < min) throw validationError(`${field} is required`, { field });
  if (trimmed.length > max) throw validationError(`${field} must be at most ${max} characters`, { field });
  return trimmed;
}

/** Like requireString, but undefined and null both mean "no value". */
export function optionalString(value, field, opts = {}) {
  if (value === undefined || value === null) return null;
  return requireString(value, field, opts);
}

export function requireEmail(value, field = 'email') {
  const email = requireString(value, field, { max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError(`${field} must be a valid email address`, { field });
  return email.toLowerCase();
}

export function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw validationError(`${field} must be one of ${allowed.join(', ')}`, { field, allowed });
  }
  return value;
}

export function requireNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw validationError(`${field} must be a number`, { field });
  }
  if (num < min) throw validationError(`${field} must be at least ${min}`, { field });
  if (num > max) throw validationError(`${field} must be at most ${max}`, { field });
  return num;
}

export function requireInteger(value, field, opts = {}) {
  const num = requireNumber(value, field, opts);
  if (!Number.isInteger(num)) throw validationError(`${field} must be a whole number`, { field });
  return num;
}

export function requireTime(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) {
    throw validationError(`${field} must be a time in HH:MM or HH:MM:SS format`, { field });
  }
  return value.length === 5 ? `${value}:00` : value;
}

/** Optional string: undefined when absent, null when explicitly cleared. */
export function optionalTime(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requireTime(value, field);
}

/** Deterministic HH:MM difference used when a punch-out is supplied without hours. */
export function hoursBetween(checkIn, checkOut) {
  const toMinutes = (t) => {
    const [h, m, s] = String(t).split(':').map(Number);
    return h * 60 + m + (s || 0) / 60;
  };
  const diff = toMinutes(checkOut) - toMinutes(checkIn);
  if (diff <= 0) throw validationError('checkOutTime must be after checkInTime', { field: 'checkOutTime' });
  return Math.round((diff / 60) * 100) / 100;
}
