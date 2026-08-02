import assert from 'node:assert';
import { CliPool } from '../src/lib/CliPool.js';
import { ProviderRegistry, AGENT_ROLES, PROVIDER_TYPES } from '../src/lib/ProviderRegistry.js';

/**
 * Regression test for the "agents looped" bug report (2026-08-02).
 *
 * Root cause: CliPool.startHealthCheck() re-spawned a replacement instance every 5s
 * tick whenever the pool was degraded, with no cap on consecutive failures and no
 * pruning of dead instances from this.instances. A provider that can never become
 * ready (bad executable, unauthenticated CLI, or — as reproduced here — the 'mock'
 * provider's `echo mock`, which exits before ever printing the readyString) caused
 * every single health-check tick to spawn a brand-new PTY process forever, with
 * this.instances growing without bound and the pool never recovering or failing
 * loudly. From the TUI this presented as the swarm "looping" with no way to tell it
 * apart from a hang, forcing the user to kill the process.
 *
 * Fix: _pruneDeadInstances() removes failed/killed entries before counting healthy
 * instances, and MAX_CONSECUTIVE_SPAWN_FAILURES bounds the retry — after that many
 * consecutive failures the pool stops respawning and emits 'pool:respawn_exhausted'
 * instead of retrying forever.
 *
 * This test drives CliPool._healthCheckTick() directly (extracted from the
 * setInterval callback specifically so it's testable without waiting on the real
 * 5000ms interval) using the 'mock' spawn strategy (PROVIDER_TYPES.OPENROUTER maps to
 * strategy 'mock' — see src/providers/index.js), spawning real `echo mock` processes
 * via node-pty. This is a PTY-tier test.
 */
async function testPoolDoesNotRespawnForever() {
  console.log('--- CliPool respawn-loop regression test ---');

  const registry = new ProviderRegistry();
  registry.setProviderEnabled(PROVIDER_TYPES.OPENROUTER, true);
  registry.setRoleMapping(AGENT_ROLES.SUBAGENT_IMPLEMENTATION, PROVIDER_TYPES.OPENROUTER, 'mock-model');

  const config = {
    mock: {
      executable: 'echo',
      args: ['mock'],
      readyString: '>',
      readyTimeout: 200,
      responseTimeout: 500,
      ptyConfig: { cols: 80, rows: 24 }
    },
    pool: { initialSize: 1, maxSize: 5 },
    providerRegistry: registry
  };

  const pool = new CliPool(config);

  const errorEvents = [];
  pool.on('instance:error', (e) => errorEvents.push(e));

  let exhausted = null;
  pool.on('pool:respawn_exhausted', (info) => { exhausted = info; });

  // Drive health-check ticks directly. Each 'echo mock' spawn fails to become ready
  // (it exits almost instantly, never printing '>'), so each tick should count as one
  // consecutive failure. Wait for each attempt to actually fail before ticking again.
  const MAX_TICKS = 5; // must match CliPool's MAX_CONSECUTIVE_SPAWN_FAILURES
  for (let i = 0; i < MAX_TICKS; i++) {
    const failed = new Promise(resolve => pool.once('instance:error', resolve));
    pool._healthCheckTick();
    await failed;
  }

  assert.strictEqual(pool._consecutiveSpawnFailures, MAX_TICKS, `expected exactly ${MAX_TICKS} consecutive failures`);
  console.log(`✅ recorded ${MAX_TICKS} consecutive spawn failures before giving up`);

  // Dead instances must not accumulate unboundedly — pruning keeps the roster from
  // growing forever even across many failed attempts.
  assert.ok(pool.instances.length <= 1, `expected dead instances to be pruned, got ${pool.instances.length} lingering`);
  console.log('✅ dead instances pruned from pool.instances, not accumulated');

  // One more tick: the pool must NOT attempt another spawn — this is the actual fix.
  // Before the fix, this would spawn a new PTY process forever, once per tick.
  const instanceCounterBefore = pool.instanceCounter;
  pool._healthCheckTick();
  // Give any (incorrect) async spawn attempt a moment to happen if the guard were missing.
  await new Promise(resolve => setTimeout(resolve, 300));

  assert.strictEqual(pool.instanceCounter, instanceCounterBefore, 'no new spawn attempt should occur after exhaustion');
  assert.ok(exhausted, 'pool:respawn_exhausted should have been emitted');
  assert.strictEqual(exhausted.attempts, MAX_TICKS);
  console.log('✅ pool stops respawning and emits pool:respawn_exhausted instead of looping forever');

  await pool.shutdown();
  console.log('--- CliPool respawn-loop regression test: All tests passed ---');
}

testPoolDoesNotRespawnForever().catch(err => {
  console.error(`❌ pool-respawn-loop.test.js failed: ${err.stack || err.message}`);
  process.exit(1);
});
