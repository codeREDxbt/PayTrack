/**
 * HTTP plumbing: JSON body reading with a hard size cap, response helpers,
 * security headers and CORS preflight. Nothing here knows about PayTrack.
 */
import { ApiError } from './errors.js';

export const MAX_BODY_BYTES = 100 * 1024;

// Vite dev (5173) and preview (4173) are served both as localhost and as
// 127.0.0.1 depending on how the server was started, so both spellings are
// allowed. Any other origin gets no CORS headers.
export const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173'
];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cache-Control': 'no-store'
};

export function applyCommonHeaders(res, req) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

export function sendData(res, status, data) {
  sendJson(res, status, { data });
}

export function sendError(res, err, extraHeaders = {}) {
  const body = { error: { code: err.code, message: err.message } };
  if (err.details !== undefined) body.error.details = err.details;
  sendJson(res, err.status, body, extraHeaders);
}

/**
 * Reads and parses a JSON request body. Rejects anything above the cap with
 * PAYLOAD_TOO_LARGE without buffering the whole stream first.
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(new ApiError('PAYLOAD_TOO_LARGE', `Request body must be at most ${MAX_BODY_BYTES} bytes`, { limitBytes: MAX_BODY_BYTES }));
      req.resume();
      return;
    }

    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new ApiError('PAYLOAD_TOO_LARGE', `Request body must be at most ${MAX_BODY_BYTES} bytes`, { limitBytes: MAX_BODY_BYTES }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', (err) => fail(err));
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new ApiError('VALIDATION_ERROR', 'Request body must be a JSON object'));
        }
        resolve(parsed);
      } catch {
        reject(new ApiError('VALIDATION_ERROR', 'Request body is not valid JSON'));
      }
    });
  });
}

/**
 * Fixed-window limiter keyed by caller-supplied string, held in memory.
 * In-memory means per-process: behind several API instances the effective
 * limit multiplies, which is acceptable for this single-node demo.
 */
export class RateLimiter {
  constructor({ limit, windowMs, maxKeys = 5000 }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  /** Records an attempt; returns { allowed, retryAfterSeconds }. */
  hit(key, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      if (this.hits.size >= this.maxKeys) this.evictExpired(now);
      this.hits.set(key, { start: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0, remaining: this.limit - 1 };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.start + this.windowMs - now) / 1000), remaining: 0 };
    }
    return { allowed: true, retryAfterSeconds: 0, remaining: this.limit - entry.count };
  }

  reset(key) {
    this.hits.delete(key);
  }

  evictExpired(now = Date.now()) {
    for (const [key, entry] of this.hits) {
      if (now - entry.start >= this.windowMs) this.hits.delete(key);
    }
  }
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
