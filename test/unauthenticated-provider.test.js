import { CliInstance } from '../src/lib/CliInstance.js';
import { CliPool } from '../src/lib/CliPool.js';

async function testUnauthenticatedProvider() {
  console.log('--- Regression Test: Unauthenticated / Missing Provider Error ---');
  
  const startTime = Date.now();
  let caughtError = null;

  try {
    const config = {
      agy: {
        executable: 'nonexistent-agy-executable',
        args: [],
        readyString: '>',
        readyTimeout: 5000
      },
      pool: {
        initialSize: 1
      }
    };

    const instance = new CliInstance('test-unauth-1', {
      provider: 'agy',
      executable: 'nonexistent-agy-executable',
      args: [],
      readyString: '>',
      readyTimeout: 5000
    });

    await instance.start();
  } catch (err) {
    caughtError = err;
  }

  const duration = Date.now() - startTime;
  console.log(`Duration: ${duration}ms`);

  if (!caughtError) {
    console.error('❌ Test failed: Expected error but instance started successfully');
    process.exit(1);
  }

  console.log(`Caught error message: "${caughtError.message}"`);

  if (caughtError.message.includes('Ready timeout after 5000ms')) {
    console.error('❌ Test failed: Received generic ready timeout instead of distinct auth error');
    process.exit(1);
  }

  if (duration >= 5000) {
    console.error(`❌ Test failed: Check took ${duration}ms, did not fail before 5000ms timeout`);
    process.exit(1);
  }

  if (!caughtError.message.includes('unauthenticated') && !caughtError.message.includes('login') && !caughtError.message.includes('not found')) {
    console.error('❌ Test failed: Error message does not clearly indicate authentication or missing executable failure');
    process.exit(1);
  }

  console.log('✅ Fast failure verified: failed before 5000ms timeout');
  console.log('✅ Distinct error message verified');
  console.log('--- Regression Test Passed ---');
}

testUnauthenticatedProvider().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
