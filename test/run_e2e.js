/**
 * ============================================================================
 * PayTrack End-to-End Master Test Runner (test/run_e2e.js)
 * ============================================================================
 * Pure zero-dependency automated test runner for Node.js v24.
 *
 * Usage:
 *   node test/run_e2e.js                 # Run all 4 tiers (134 tests)
 *   node test/run_e2e.js --tier=1        # Run Tier 1: Feature Coverage (56 tests)
 *   node test/run_e2e.js --tier=2        # Run Tier 2: Boundary & Corner Cases (56 tests)
 *   node test/run_e2e.js --tier=3        # Run Tier 3: Pairwise Combinations (16 tests)
 *   node test/run_e2e.js --tier=4        # Run Tier 4: Real-World Workloads (6 scenarios)
 *   node test/run_e2e.js --verbose       # Show every single test case assertion
 *   node test/run_e2e.js --json          # Output JSON machine-readable report
 * ============================================================================
 */

import { runTier1Tests } from './tier1_features.test.js';
import { runTier2Tests } from './tier2_boundaries.test.js';
import { runTier3Tests } from './tier3_pairwise.test.js';
import { runTier4Tests } from './tier4_realworld.test.js';

// Parse command line arguments
const args = process.argv.slice(2);
let selectedTier = 'all';
let isVerbose = false;
let isJson = false;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    selectedTier = arg.split('=')[1].toLowerCase();
  } else if (arg === '--verbose' || arg === '-v') {
    isVerbose = true;
  } else if (arg === '--json') {
    isJson = true;
  }
}

async function main() {
  const overallStart = performance.now();
  const allResults = {
    tier1: [],
    tier2: [],
    tier3: [],
    tier4: []
  };

  const createReporter = (tierName) => ({
    record: (result) => {
      if (isVerbose && !isJson) {
        const icon = result.status === 'PASS' ? '✔' : '✖';
        console.log(`  ${icon} [${result.id}] ${result.description} (${result.duration}ms)`);
        if (result.status === 'FAIL' && result.error) {
          console.error(`      ERROR: ${result.error}`);
        }
      }
    }
  });

  if (!isJson) {
    console.log('='.repeat(80));
    console.log('          PAYTRACK END-TO-END TEST SUITE (OPAQUE-BOX VERIFICATION)');
    console.log('='.repeat(80));
    console.log(`Node Engine: ${process.version} | SQLite: Built-in DatabaseSync | Mode: Ephemeral Isolated\n`);
  }

  // Tier 1: Feature Coverage
  if (selectedTier === '1' || selectedTier === 'all') {
    if (!isJson && !isVerbose) process.stdout.write('[TIER 1] FEATURE COVERAGE (Core Functional Happy-Path)... ');
    const tStart = performance.now();
    allResults.tier1 = await runTier1Tests(createReporter('tier1'));
    const tDuration = Number((performance.now() - tStart).toFixed(2));
    const passed = allResults.tier1.filter(r => r.status === 'PASS').length;
    const failed = allResults.tier1.filter(r => r.status === 'FAIL').length;
    if (!isJson) {
      if (!isVerbose) {
        console.log(`DONE: ${passed} Passed, ${failed} Failed (${tDuration}ms)`);
      } else {
        console.log(`  Subtotal Tier 1: ${passed} Passed, ${failed} Failed (Elapsed: ${tDuration}ms)\n`);
      }
    }
  }

  // Tier 2: Boundary & Corner Cases
  if (selectedTier === '2' || selectedTier === 'all') {
    if (!isJson && !isVerbose) process.stdout.write('[TIER 2] BOUNDARY & CORNER CASES (Edge Conditions & Constraints)... ');
    const tStart = performance.now();
    allResults.tier2 = await runTier2Tests(createReporter('tier2'));
    const tDuration = Number((performance.now() - tStart).toFixed(2));
    const passed = allResults.tier2.filter(r => r.status === 'PASS').length;
    const failed = allResults.tier2.filter(r => r.status === 'FAIL').length;
    if (!isJson) {
      if (!isVerbose) {
        console.log(`DONE: ${passed} Passed, ${failed} Failed (${tDuration}ms)`);
      } else {
        console.log(`  Subtotal Tier 2: ${passed} Passed, ${failed} Failed (Elapsed: ${tDuration}ms)\n`);
      }
    }
  }

  // Tier 3: Pairwise Interactions
  if (selectedTier === '3' || selectedTier === 'all') {
    if (!isJson && !isVerbose) process.stdout.write('[TIER 3] CROSS-FEATURE INTERACTIONS (Pairwise & State Transitions)... ');
    const tStart = performance.now();
    allResults.tier3 = await runTier3Tests(createReporter('tier3'));
    const tDuration = Number((performance.now() - tStart).toFixed(2));
    const passed = allResults.tier3.filter(r => r.status === 'PASS').length;
    const failed = allResults.tier3.filter(r => r.status === 'FAIL').length;
    if (!isJson) {
      if (!isVerbose) {
        console.log(`DONE: ${passed} Passed, ${failed} Failed (${tDuration}ms)`);
      } else {
        console.log(`  Subtotal Tier 3: ${passed} Passed, ${failed} Failed (Elapsed: ${tDuration}ms)\n`);
      }
    }
  }

  // Tier 4: Real-World Workloads
  if (selectedTier === '4' || selectedTier === 'all') {
    if (!isJson && !isVerbose) process.stdout.write('[TIER 4] REAL-WORLD SCENARIOS (End-to-End Enterprise Workloads)... ');
    const tStart = performance.now();
    allResults.tier4 = await runTier4Tests(createReporter('tier4'));
    const tDuration = Number((performance.now() - tStart).toFixed(2));
    const passed = allResults.tier4.filter(r => r.status === 'PASS').length;
    const failed = allResults.tier4.filter(r => r.status === 'FAIL').length;
    if (!isJson) {
      if (!isVerbose) {
        console.log(`DONE: ${passed} Passed, ${failed} Failed (${tDuration}ms)`);
      } else {
        console.log(`  Subtotal Tier 4: ${passed} Passed, ${failed} Failed (Elapsed: ${tDuration}ms)\n`);
      }
    }
  }

  const totalDuration = Number((performance.now() - overallStart).toFixed(2));
  const combined = [
    ...allResults.tier1,
    ...allResults.tier2,
    ...allResults.tier3,
    ...allResults.tier4
  ];

  const totalRun = combined.length;
  const totalPassed = combined.filter(r => r.status === 'PASS').length;
  const totalFailed = combined.filter(r => r.status === 'FAIL').length;

  if (isJson) {
    const report = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      totalDurationMs: totalDuration,
      summary: {
        total: totalRun,
        passed: totalPassed,
        failed: totalFailed,
        success: totalFailed === 0
      },
      tiers: {
        tier1: { total: allResults.tier1.length, passed: allResults.tier1.filter(r => r.status === 'PASS').length, results: allResults.tier1 },
        tier2: { total: allResults.tier2.length, passed: allResults.tier2.filter(r => r.status === 'PASS').length, results: allResults.tier2 },
        tier3: { total: allResults.tier3.length, passed: allResults.tier3.filter(r => r.status === 'PASS').length, results: allResults.tier3 },
        tier4: { total: allResults.tier4.length, passed: allResults.tier4.filter(r => r.status === 'PASS').length, results: allResults.tier4 }
      }
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = (totalFailed === 0 ? 0 : 1);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('                               EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Tests Run: ${totalRun}`);
  console.log(`  Passed:          ${totalPassed}`);
  console.log(`  Failed:          ${totalFailed}`);
  console.log(`  Skipped:         0`);
  console.log(`  Total Duration:  ${totalDuration}ms`);
  if (totalFailed === 0) {
    console.log('  Final Status:    ALL TESTS PASSED (Exit Code: 0)');
  } else {
    console.log(`  Final Status:    FAILED (${totalFailed} failures) (Exit Code: 1)`);
  }
  console.log('='.repeat(80) + '\n');

  if (totalFailed > 0) {
    console.error('FAILURES SUMMARY:');
    combined.filter(r => r.status === 'FAIL').forEach(f => {
      console.error(`- [${f.id}] ${f.description}: ${f.error}`);
    });
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

main().catch(err => {
  console.error('FATAL UNCAUGHT RUNNER ERROR:', err);
  process.exit(1);
});
