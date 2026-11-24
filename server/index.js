#!/usr/bin/env node
/**
 * CLI entry: `node server/index.js`
 *   PORT              listen port (default 4000; 0 picks a free port)
 *   PAYTRACK_DB_PATH  database file (default database/paytrack.sqlite)
 */
import path from 'node:path';
import { startApiServer } from './server.js';
import { DATABASE_DIR } from './bootstrap.js';

const port = Number(process.env.PORT ?? 4000);
const dbPath = process.env.PAYTRACK_DB_PATH
  ? path.resolve(process.env.PAYTRACK_DB_PATH)
  : path.join(DATABASE_DIR, 'paytrack.sqlite');

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid PORT "${process.env.PORT}"`);
  process.exit(1);
}

let api;
try {
  api = await startApiServer({ port, dbPath, log: (m) => console.log(`[db] ${m}`) });
} catch (err) {
  console.error(`Failed to start: ${err.message}`);
  process.exit(1);
}
console.log(`PayTrack API listening on ${api.baseUrl}`);
console.log(`Database: ${dbPath}`);

const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  await api.close();
  process.exit(0);
};
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
