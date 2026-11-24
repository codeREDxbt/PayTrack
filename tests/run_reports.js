/**
 * ============================================================================
 * PayTrack Phase 3 Report Suite Runner (tests/run_reports.js)
 * ============================================================================
 * Usage:
 *   node tests/run_reports.js              # Run the report suite
 *   node tests/run_reports.js --verbose    # List every test as it passes
 *   node tests/run_reports.js --json       # Machine-readable report
 *
 * Prints the captured EXPLAIN QUERY PLAN output (with and without the
 * Section 2 report indexes) so docs/phase-3/query-reports.md can quote real output.
 * Exit code 1 if any test fails.
 * ============================================================================
 */

import { runPhase3ReportTests } from './phase3_reports.test.js';

const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const isJson = args.includes('--json');

function renderPlan(plan) {
  return plan.map(line => `      ${line}`).join('\n');
}

function printExplain(explain) {
  for (const [id, c] of Object.entries(explain)) {
    console.log(`\n  [${id}] ${c.title}`);
    if (c.baselineSql) console.log(`    Baseline SQL: ${c.baselineSql}`);
    console.log(`    SQL: ${c.sql}`);
    if (c.params && c.params.length) console.log(`    Params: ${JSON.stringify(c.params)}`);

    if (c.before && c.after) {
      console.log(`    BEFORE (no report indexes)${c.baselineSql ? ', baseline query' : ''}:`);
      console.log(renderPlan(c.before));
      console.log(`    AFTER  (with ${c.index}):`);
      console.log(renderPlan(c.after));
    } else if (c.withIndexes) {
      console.log('    WITH report indexes:');
      console.log(renderPlan(c.withIndexes));
      if (c.withoutIndexes) {
        console.log('    WITHOUT report indexes:');
        console.log(renderPlan(c.withoutIndexes));
      }
    }
  }
}

async function main() {
  const start = performance.now();

  if (!isJson) {
    console.log('='.repeat(80));
    console.log('        PAYTRACK PHASE 3 REPORT DEVELOPMENT TEST SUITE');
    console.log('='.repeat(80));
    console.log(`Node Engine: ${process.version} | SQLite: node:sqlite DatabaseSync | DB: os.tmpdir()\n`);
  }

  const reporter = {
    record: (result) => {
      if (isVerbose && !isJson) {
        const icon = result.status === 'PASS' ? '[PASS]' : '[FAIL]';
        console.log(`  ${icon} [${result.id}] ${result.description} (${result.duration}ms)`);
        if (result.status === 'FAIL' && result.error) console.error(`         ERROR: ${result.error}`);
      }
    }
  };

  const { results, explain } = await runPhase3ReportTests(reporter);
  const duration = Number((performance.now() - start).toFixed(2));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  if (isJson) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      totalDurationMs: duration,
      summary: { total: results.length, passed, failed, success: failed === 0 },
      results,
      explain
    }, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  if (!isVerbose) {
    for (const r of results) {
      if (r.status === 'FAIL') console.error(`  [FAIL] [${r.id}] ${r.description}\n         ERROR: ${r.error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('  EXPLAIN QUERY PLAN — CAPTURED (before / after report indexes)');
  console.log('='.repeat(80));
  printExplain(explain);

  console.log('\n' + '='.repeat(80));
  console.log('                               EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Tests Run: ${results.length}`);
  console.log(`  Passed:          ${passed}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Total Duration:  ${duration}ms`);
  console.log(failed === 0
    ? '  Final Status:    ALL TESTS PASSED (Exit Code: 0)'
    : `  Final Status:    FAILED (${failed} failures) (Exit Code: 1)`);
  console.log('='.repeat(80) + '\n');

  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('FATAL UNCAUGHT RUNNER ERROR:', err);
  process.exit(1);
});
