import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const PURE_TESTS = [
  'phase1-check.js',
  'phase1a-auth.test.js',
  'unauthenticated-provider.test.js',
  'phase2-check.js',
  'phase4-check.js',
  'phase5-check.js',
  'phase6-check.js',
  'approval-queue.test.js',
  'production-lock.js',
  'verify-config-loader.js'
];

export const PTY_TESTS = [
  'smoke-test.js',
  'phase3-check.js'
];

function verifyAllTestsRegistered() {
  const allOnDisk = fs.readdirSync(__dirname).filter(f => f.endsWith('-check.js') || f.endsWith('.test.js') || f.endsWith('-test.js'));
  const registered = new Set([...PURE_TESTS, ...PTY_TESTS]);
  const unregistered = allOnDisk.filter(f => !registered.has(f));
  if (unregistered.length > 0) {
    console.error(`❌ Test runner error: Found test files on disk not registered in run.js: ${unregistered.join(', ')}`);
    process.exit(1);
  }
}

function canLoadNodePty() {
  try {
    require('node-pty');
    return true;
  } catch (e) {
    return false;
  }
}

function runTier(tierName, testList) {
  console.log(`\n--- Running ${tierName} Tier (${testList.length} tests) ---`);
  let passed = 0;
  let failed = 0;

  for (const test of testList) {
    console.log(`Running ${test}...`);
    const result = spawnSync('node', [path.join(__dirname, test)], {
      encoding: 'utf8',
      stdio: 'inherit'
    });

    if (result.status === 0) {
      console.log(`✅ ${test} passed\n`);
      passed++;
    } else {
      console.log(`❌ ${test} failed (Exit Code: ${result.status})\n`);
      failed++;
    }
  }

  return { passed, failed };
}

function main() {
  verifyAllTestsRegistered();

  const args = process.argv.slice(2);
  const runPureOnly = args.includes('--pure');
  const runPtyOnly = args.includes('--pty');

  console.log('🚀 Running DexCLI Test Suite...\n');
  const startTime = Date.now();

  let totalPassed = 0;
  let totalFailed = 0;
  let ptySkipped = false;

  if (runPureOnly) {
    const pureRes = runTier('Pure', PURE_TESTS);
    totalPassed += pureRes.passed;
    totalFailed += pureRes.failed;
  } else if (runPtyOnly) {
    if (!canLoadNodePty()) {
      console.log('⚠️ skipped: no node-pty prebuild for this platform');
      ptySkipped = true;
    } else {
      const ptyRes = runTier('PTY', PTY_TESTS);
      totalPassed += ptyRes.passed;
      totalFailed += ptyRes.failed;
    }
  } else {
    // Run both tiers separately
    const pureRes = runTier('Pure', PURE_TESTS);
    totalPassed += pureRes.passed;
    totalFailed += pureRes.failed;

    if (!canLoadNodePty()) {
      console.log('\n--- Running PTY Tier ---');
      console.log('⚠️ skipped: no node-pty prebuild for this platform');
      ptySkipped = true;
    } else {
      const ptyRes = runTier('PTY', PTY_TESTS);
      totalPassed += ptyRes.passed;
      totalFailed += ptyRes.failed;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n--- Test Summary ---');
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  if (ptySkipped) console.log('PTY Tier: Skipped');
  console.log(`Duration: ${duration}s\n`);

  if (totalFailed > 0) {
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL EXECUTED TESTS PASSED');
    process.exit(0);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}