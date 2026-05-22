import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  'phase1-check.js',
  'smoke-test.js',
  'phase2-check.js',
  'phase3-check.js'
];

console.log('🚀 Running DexCLI Test Suite...\n');
const startTime = Date.now();

let passed = 0;
let failed = 0;

tests.forEach(test => {
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
});

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('--- Test Summary ---');
console.log(`Total: ${tests.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Duration: ${duration}s\n`);

if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
  process.exit(0);
}