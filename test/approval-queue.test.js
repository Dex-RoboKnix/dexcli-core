import assert from 'node:assert';
import { CliPool } from '../src/lib/CliPool.js';

// Minimal mock to avoid actually spawning instances
class MockCliInstance {
  constructor(id) {
    this.id = id;
    this.status = 'idle';
  }
  isIdle() { return true; }
  needsRecycle() { return false; }
  async start() {}
  async send(prompt) { return `Mock response for: ${prompt}`; }
  kill() {}
  assignRole(role) { this.role = role; }
}

async function runTest() {
  const config = {
    gemini: { executable: 'mock-gemini' },
    pool: { initialSize: 1, maxSize: 1 }
  };

  const pool = new CliPool(config);
  
  // Override _spawnInstance to inject our mock
  pool._spawnInstance = async function() {
    const id = `gemini-mock-${this.instanceCounter++}`;
    const instance = new MockCliInstance(id);
    this.instances.push(instance);
    return instance;
  };

  await pool.initialize();

  const promptHardcoded = 'dex[admin:sudo] Run dangerous command';
  
  const result = await pool.execute(promptHardcoded, { role: 'admin' });
  
  // It should be intercepted and return an approval card, not the response
  assert.strictEqual(result.status, 'pending_layer8_approval', 'Should return pending approval status');
  assert.ok(result.id, 'Should have an approval id');
  
  // Now approve it
  const executionResult = await pool.approveAndExecute(result.id);
  
  assert.strictEqual(executionResult.response, `Mock response for: ${promptHardcoded}`, 'Should execute successfully after approval');
  
  console.log('Approval queue test passed successfully.');
  
  await pool.shutdown();
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
