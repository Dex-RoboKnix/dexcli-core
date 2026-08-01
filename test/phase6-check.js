/**
 * phase6-check.js — F6/F7 checks: setup wizard and ADE bridge.
 *
 * Both avoid importing CliPool.js/CliInstance.js (node-pty, no Linux prebuild here —
 * see phase5-check.js's header) and avoid opening a real blessed screen (no TTY in
 * this sandbox). SetupWizard.check() and AdeBridge are both designed to be exercised
 * headlessly for exactly this reason.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';

import { SetupWizard } from '../src/lib/SetupWizard.js';
import { AdeBridge, buildEnvelope, DEFAULT_RUNTIME_PORT, PROTOCOL_VERSION } from '../src/lib/AdeBridge.js';

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    const result = await fn();
    if (result === false) throw new Error('assertion returned false');
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function tmpConfigPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-setup-')), 'providers.json');
}

async function main() {
  console.log('\n--- F6: setup wizard ---');

  await check('check() reports valid on a fresh (default) config', () => {
    const wizard = new SetupWizard({ configPath: tmpConfigPath() });
    const { valid, problems } = wizard.check();
    assert(valid === true, `expected valid defaults, got problems: ${JSON.stringify(problems)}`);
  });

  await check('check() surfaces every problem at once, not just the first', () => {
    const configPath = tmpConfigPath();
    const wizard = new SetupWizard({ configPath });
    // Disable both default-mapped providers so two roles break simultaneously.
    wizard.registry.setProviderEnabled('anthropic', false);
    wizard.registry.setProviderEnabled('google', false);
    const { valid, problems } = wizard.check();
    assert(valid === false, 'expected invalid state after disabling both mapped providers');
    assert(problems.length >= 2, `expected multiple problems reported together, got ${problems.length}`);
  });

  await check('save() persists to disk and a fresh load() round-trips role mappings', () => {
    const configPath = tmpConfigPath();
    const wizard = new SetupWizard({ configPath });
    wizard.registry.setRoleMapping('subagent_researcher', 'anthropic', 'claude-opus-4-1');
    wizard.registry.save(configPath);
    assert(fs.existsSync(configPath), 'save() did not write the config file');

    const reloaded = new SetupWizard({ configPath });
    const cfg = reloaded.registry.getRoleConfig('subagent_researcher');
    assert(cfg.modelId === 'claude-opus-4-1', `expected persisted model override, got ${cfg.modelId}`);
  });

  console.log('\n--- F7: ADE bridge ---');

  await check('buildEnvelope matches ade-core ProtocolEnvelopeSchema shape', () => {
    const env = buildEnvelope('dexcli.instance.data', { id: 'x', chunk: 'hi' });
    assert(Object.keys(env).sort().join(',') === 'id,kind,payload,ts,v', 'unexpected envelope keys');
    assert(env.v === PROTOCOL_VERSION, 'v must be pinned to PROTOCOL_VERSION');
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(env.ts), 'ts must be canonical ISO 8601 UTC');
    assert(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(env.kind), 'kind must be dot-delimited lowercase segments');
  });

  await check('DEFAULT_RUNTIME_PORT matches ade-core/services/agent-runtime/src/lib.rs', () => {
    assert(DEFAULT_RUNTIME_PORT === 47611, `expected 47611, got ${DEFAULT_RUNTIME_PORT}`);
  });

  await check('AdeBridge.start() subscribes to every CliPool instance:* event', () => {
    const fakePool = new EventEmitter();
    const bridge = new AdeBridge(fakePool, { port: 1 }); // port 1: guaranteed nothing listens
    bridge.start();
    const expected = ['instance:ready', 'instance:crashed', 'instance:error', 'instance:data', 'instance:response'];
    for (const event of expected) {
      assert(fakePool.listenerCount(event) === 1, `expected exactly one listener on "${event}"`);
    }
    bridge.stop();
    for (const event of expected) {
      assert(fakePool.listenerCount(event) === 0, `stop() left a listener on "${event}"`);
    }
  });

  await check('probe() resolves false against an unreachable port instead of throwing', async () => {
    const fakePool = new EventEmitter();
    const bridge = new AdeBridge(fakePool, { port: 1 });
    const reachable = await bridge.probe(300);
    assert(reachable === false, 'expected probe() to report unreachable, not throw');
  });

  await check('an unreachable runtime reports via onError instead of crashing the process', async () => {
    const fakePool = new EventEmitter();
    const errors = [];
    const bridge = new AdeBridge(fakePool, { port: 1, onError: (err) => errors.push(err) });
    bridge.start();
    fakePool.emit('instance:data', { id: 'gemini-0', chunk: 'output' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    bridge.stop();
    assert(errors.length === 1, `expected exactly one queued send to fail with a reported error, got ${errors.length}`);
  });

  console.log(`\n--- Phase 6 Summary: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
