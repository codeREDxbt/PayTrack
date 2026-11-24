/**
 * ============================================================================
 * PayTrack Phase 5 REST API Test Runner (test/run_api.js)
 * ============================================================================
 * Same output style as test/run_e2e.js.
 *
 * Usage:
 *   node test/run_api.js              # run the API suite
 *   node test/run_api.js --verbose    # print every passing test too
 *   node test/run_api.js --json       # machine-readable report
 *
 * Every suite starts its own server on an ephemeral port against a fresh
 * in-memory database; nothing here touches database/paytrack.sqlite.
 * ============================================================================
 */
import { runApiTests } from './phase5_api.test.js';

const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const isJson = process.argv.includes('--json');

const reporter = {
  record(result) {
    if (!isVerbose || isJson) return;
    const icon = result.status === 'PASS' ? '✔' : '✖';
    console.log(`  ${icon} [${result.id}] ${result.description} (${result.duration}ms)`);
    if (result.status === 'FAIL' && result.error) console.error(`      ERROR: ${result.error}`);
  }
};

async function main() {
  const overallStart = performance.now();
  if (!isJson) {
    console.log('='.repeat(80));
    console.log('          PAYTRACK PHASE 5 REST API TEST SUITE');
    console.log('='.repeat(80));
    console.log(`Node Engine: ${process.version} | SQLite: node:sqlite | Transport: HTTP + fetch\n`);
  }

  if (!isJson && !isVerbose) process.stdout.write('[T5] API CONTRACT (every endpoint x every role)... ');
  const results = await runApiTests(reporter);
  const duration = Number((performance.now() - overallStart).toFixed(2));
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  if (isJson) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      totalDurationMs: duration,
      summary: { total: results.length, passed, failed, success: failed === 0 },
      results
    }, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  if (!isVerbose) console.log(`DONE: ${passed} Passed, ${failed} Failed (${duration}ms)`);

  console.log('\n' + '='.repeat(80));
  console.log('                               EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Tests Run: ${results.length}`);
  console.log(`  Passed:          ${passed}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Skipped:         0`);
  console.log(`  Total Duration:  ${duration}ms`);
  if (failed === 0) console.log('  Final Status:    ALL TESTS PASSED (Exit Code: 0)');
  else console.log(`  Final Status:    FAILED (${failed} failures) (Exit Code: 1)`);
  console.log('='.repeat(80) + '\n');

  if (failed > 0) {
    console.error('FAILURES SUMMARY:');
    results.filter((r) => r.status === 'FAIL').forEach((f) => console.error(`- [${f.id}] ${f.description}: ${f.error}`));
  }
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('FATAL UNCAUGHT RUNNER ERROR:', err);
  process.exit(1);
});
