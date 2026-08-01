/**
 * phase5-check.js — F3/F4/F5/F10 wiring checks.
 *
 * Covers the integration seams added when ProviderRegistry, AgentsSpecResolver and
 * DexFilter were wired into the pool/orchestrator/instance layer. Deliberately avoids
 * importing CliPool.js or CliInstance.js: both pull in node-pty, which has no Linux
 * prebuild in this environment (see HANDOFF-TO-CLAUDE.md §5.2 / production-lock notes).
 * Everything here exercises pure resolution logic instead.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { fileURLToPath } from 'url';

import { PROVIDER_ID_TO_STRATEGY, strategyForProviderId, getProvider } from '../src/providers/index.js';
import { PROVIDER_TYPES, ProviderRegistry, AGENT_ROLES } from '../src/lib/ProviderRegistry.js';
import { Orchestrator } from '../src/lib/Orchestrator.js';

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

function makeWorkspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-orch-ws-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

async function main() {
  console.log('\n--- F3: provider strategy mapping ---');

  await check('every PROVIDER_TYPES id has a strategy mapping', () => {
    for (const id of Object.values(PROVIDER_TYPES)) {
      assert(id in PROVIDER_ID_TO_STRATEGY, `no strategy mapped for provider "${id}"`);
    }
  });

  await check('every mapped strategy name resolves to a real provider module', () => {
    for (const strategy of Object.values(PROVIDER_ID_TO_STRATEGY)) {
      assert(getProvider(strategy), `strategy "${strategy}" is not registered in providers/index.js`);
    }
  });

  await check('google -> agy, anthropic -> claude (the two PTY_REPL vendors)', () => {
    assert(strategyForProviderId(PROVIDER_TYPES.GOOGLE) === 'agy');
    assert(strategyForProviderId(PROVIDER_TYPES.ANTHROPIC) === 'claude');
  });

  await check('unimplemented API_KEY vendors degrade to mock rather than throwing', () => {
    assert(strategyForProviderId(PROVIDER_TYPES.OPENROUTER) === 'mock');
    assert(strategyForProviderId(PROVIDER_TYPES.OPENAI) === 'mock');
  });

  await check('unknown provider id falls back to mock, not undefined', () => {
    assert(strategyForProviderId('no-such-vendor') === 'mock');
  });

  await check('ProviderRegistry role resolution feeds the strategy map end-to-end', () => {
    const registry = new ProviderRegistry();
    const roleConfig = registry.getRoleConfig(AGENT_ROLES.SUBAGENT_IMPLEMENTATION);
    const strategy = strategyForProviderId(roleConfig.providerId);
    assert(strategy === 'agy', `default implementation role should resolve to agy, got ${strategy}`);
  });

  console.log('\n--- F4: AgentsSpecResolver wired into Orchestrator prompts ---');

  await check('Orchestrator.formatPrompt injects the resolved AGENTS.md content', () => {
    const dir = makeWorkspace({ 'AGENTS.md': '- always run tests before committing\n' });
    const fakePool = { execute: async () => ({}) };
    const orchestrator = new Orchestrator(fakePool, { workspaceDir: dir });
    const formatted = orchestrator.formatPrompt('do the thing');
    assert(formatted.includes('always run tests before committing'), 'AGENTS.md rule missing from formatted prompt');
    assert(formatted.includes('do the thing'), 'original task prompt missing');
    assert(formatted.indexOf('always run tests') < formatted.indexOf('do the thing'), 'spec must precede task');
  });

  await check('Orchestrator falls back to inlined defaults with no workspace spec files', () => {
    const dir = makeWorkspace({});
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    const fakePool = { execute: async () => ({}) };
    const orchestrator = new Orchestrator(fakePool, { workspaceDir: dir });
    const formatted = orchestrator.formatPrompt('task');
    assert(formatted.includes('DEFAULT_INLINED'), 'expected DEFAULT_INLINED SSOT label');
  });

  await check('executeParallel routes the formatted prompt (not the raw one) to the pool', async () => {
    const dir = makeWorkspace({ 'AGENTS.md': '- unique-marker-xyz\n' });
    let capturedPrompt = null;
    const fakePool = {
      execute: async (prompt) => {
        capturedPrompt = prompt;
        return { instanceId: 'x', response: 'ok', role: null };
      }
    };
    const orchestrator = new Orchestrator(fakePool, { workspaceDir: dir });
    await orchestrator.executeParallel([{ id: 't1', priority: 1, prompt: 'raw task prompt', role: null }]);
    assert(capturedPrompt !== 'raw task prompt', 'pool received the unformatted prompt — spec was not injected');
    assert(capturedPrompt.includes('unique-marker-xyz'), 'formatted prompt sent to pool is missing the spec content');
  });

  await check('spec is resolved once and cached, not re-read per task', () => {
    const dir = makeWorkspace({ 'AGENTS.md': '- rule\n' });
    const orchestrator = new Orchestrator({ execute: async () => ({}) }, { workspaceDir: dir });
    let calls = 0;
    const realResolve = orchestrator.specResolver.resolveSpec.bind(orchestrator.specResolver);
    orchestrator.specResolver.resolveSpec = (...args) => { calls++; return realResolve(...args); };
    orchestrator.formatPrompt('a');
    orchestrator.formatPrompt('b');
    orchestrator.formatPrompt('c');
    assert(calls === 1, `expected resolveSpec called once, got ${calls}`);
  });

  console.log('\n--- F10: InstancePool withdrawal ---');

  await check('InstancePool.js is on the production-lock forbidden list', () => {
    const lockSrc = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'production-lock.js'),
      'utf8'
    );
    assert(lockSrc.includes("'src/lib/InstancePool.js'"), 'InstancePool.js not registered as forbidden in production-lock.js');
  });

  console.log(`\n--- Phase 5 Summary: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
