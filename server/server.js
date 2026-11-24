/**
 * HTTP entry point: startApiServer({ port, dbPath }) → { server, port, close() }.
 *
 * One synchronous SQLite connection is shared by every request. That is safe
 * because node:sqlite is synchronous: each handler runs to completion before
 * the event loop can start another one.
 */
import http from 'node:http';
import path from 'node:path';
import { initializeDatabase, DATABASE_DIR, removeDatabaseFiles } from './bootstrap.js';
import { createRouter } from './app.js';
import { createRateLimiter } from './routes/auth.js';
import {
  applyCommonHeaders, readJsonBody, sendData, sendError, RateLimiter
} from './http.js';
import { ApiError, fromDatabaseError } from './errors.js';
import { bearerToken, resolveSession } from './auth.js';

const DEFAULT_DB_PATH = path.join(DATABASE_DIR, 'paytrack.sqlite');

export async function startApiServer({
  port = 4000,
  host = '127.0.0.1',
  dbPath = DEFAULT_DB_PATH,
  log = () => {},
  hooks = {},
  ownsDatabase = false
} = {}) {
  const db = initializeDatabase(dbPath, { log });
  const router = createRouter();
  const rateLimiter = createRateLimiter();
  // Exchange attempts are limited separately from password guesses so a
  // signed-in-but-broken client cannot lock the account out of password login.
  const exchangeLimiter = new RateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      applyCommonHeaders(res, req);
      const apiErr = err instanceof ApiError ? err : fromDatabaseError(err);
      if (apiErr.status >= 500) log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${apiErr.message}: ${err?.message}`);
      try {
        sendError(res, apiErr);
      } catch {
        res.destroy();
      }
    });
  });

  async function handle(req, res) {
    applyCommonHeaders(res, req);

    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const match = router.find(req.method, url.pathname);
    if (!match) throw new ApiError('NOT_FOUND', `No route for ${url.pathname}`);
    if (match.methodNotAllowed) throw new ApiError('NOT_FOUND', `Method ${req.method} is not allowed on ${url.pathname}`);

    const ctx = {
      req,
      res,
      db,
      params: match.params,
      query: url.searchParams,
      body: {},
      user: null,
      rateLimiter,
      exchangeLimiter,
      hooks
    };

    const token = bearerToken(req);
    if (token) ctx.user = resolveSession(db, token);

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') ctx.body = await readJsonBody(req);

    const result = await match.route.handler(ctx);
    sendData(res, result.status ?? 200, result.data);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const actualPort = server.address().port;
  const shownHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const baseUrl = `http://${shownHost}:${actualPort}/api`;

  return {
    server,
    port: actualPort,
    baseUrl,
    db,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      try { db.close(); } catch { /* already closed */ }
      if (ownsDatabase) removeDatabaseFiles(dbPath);
    }
  };
}

export { initializeDatabase, createRouter };
export default startApiServer;
