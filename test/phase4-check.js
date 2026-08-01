/**
 * phase4-check.js — Provider registry, spec resolver & DEXFILTER pipeline.
 *
 * Deliberately dependency-free (no node-pty), so this suite runs on any platform and in CI
 * where the Windows PTY prebuild is unavailable.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ProviderRegistry, PROVIDER_TYPES, AGENT_ROLES, AUTH_METHODS } from '../src/lib/ProviderRegistry.js';
import { AgentsSpecResolver, SPEC_MODES } from '../src/lib/AgentsSpecResolver.js';
import { applyDexFilter, tryParseEnvelope, requiresApproval } from '../src/lib/DexFilter.js';
import { parseDEX838, formatDEX838 } from '../src/lib/Dex838.js';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
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

function throws(fn, message) {
  try {
    fn();
  } catch {
    return true;
  }
  throw new Error(message || 'expected a throw, got none');
}

console.log('\n--- ProviderRegistry ---');

check('every declared PROVIDER_TYPE is registered', () => {
  const registry = new ProviderRegistry();
  for (const id of Object.values(PROVIDER_TYPES)) {
    assert(registry.providers[id], `provider "${id}" declared but not registered`);
  }
});

check('every role resolves to a real provider', () => {
  const registry = new ProviderRegistry();
  for (const role of Object.values(AGENT_ROLES)) {
    const config = registry.getRoleConfig(role);
    assert(config.providerId, `role ${role} has no providerId`);
    assert(Object.values(AUTH_METHODS).includes(config.authMethod),
      `role ${role} has bogus authMethod "${config.authMethod}"`);
  }
});

check('unknown role throws rather than returning undefined', () =>
  throws(() => new ProviderRegistry().getRoleConfig('no_such_role')));

check('dangling provider reference throws rather than "unknown" authMethod', () => {
  const registry = new ProviderRegistry({
    roleMappings: { [AGENT_ROLES.ORCHESTRATOR]: { providerId: 'ghost', modelId: 'x' } }
  });
  return throws(() => registry.getRoleConfig(AGENT_ROLES.ORCHESTRATOR));
});

check('partial provider override preserves sibling fields', () => {
  const registry = new ProviderRegistry({
    providers: { [PROVIDER_TYPES.GOOGLE]: { enabled: false } }
  });
  const google = registry.providers[PROVIDER_TYPES.GOOGLE];
  assert(google.enabled === false, 'override not applied');
  assert(google.name === 'Google AI Pro (Gemini)', 'sibling field "name" was wiped by merge');
  assert(Array.isArray(google.models) && google.models.length > 0, 'sibling field "models" was wiped');
});

check('setRoleMapping rejects unknown provider', () =>
  throws(() => new ProviderRegistry().setRoleMapping(AGENT_ROLES.ORCHESTRATOR, 'ghost', 'm')));

check('validate() flags a disabled provider bound to a role', () => {
  const registry = new ProviderRegistry();
  registry.setRoleMapping(AGENT_ROLES.ORCHESTRATOR, PROVIDER_TYPES.OLLAMA, 'llama3:70b');
  const { valid, problems } = registry.validate();
  assert(!valid, 'expected validation to fail on disabled provider');
  assert(problems.some(p => p.includes('disabled')), `expected a "disabled" problem, got ${problems}`);
});

check('save() then load() round-trips role mappings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-reg-'));
  const configPath = path.join(dir, 'providers.json');

  const registry = new ProviderRegistry();
  registry.setProviderEnabled(PROVIDER_TYPES.OLLAMA, true);
  registry.setRoleMapping(AGENT_ROLES.SUBAGENT_IMPLEMENTATION, PROVIDER_TYPES.OLLAMA, 'qwen2.5-coder:32b');
  registry.save(configPath);

  const reloaded = ProviderRegistry.load(configPath);
  const config = reloaded.getRoleConfig(AGENT_ROLES.SUBAGENT_IMPLEMENTATION);
  assert(config.providerId === PROVIDER_TYPES.OLLAMA, `expected ollama, got ${config.providerId}`);
  assert(config.modelId === 'qwen2.5-coder:32b', `model lost in round-trip: ${config.modelId}`);
});

console.log('\n--- AgentsSpecResolver ---');

function makeWorkspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-ws-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

check('AGENTS.md wins over CLAUDE.md by default', () => {
  const dir = makeWorkspace({ 'AGENTS.md': '- rule a\n', 'CLAUDE.md': '- rule c\n' });
  const spec = new AgentsSpecResolver(dir).resolveSpec();
  assert(spec.activeSsot === 'AGENTS.md', `expected AGENTS.md, got ${spec.activeSsot}`);
  assert(spec.rawContent.indexOf('rule a') < spec.rawContent.indexOf('rule c'),
    'AGENTS.md must be ingested before CLAUDE.md');
  assert(spec.sources.length === 2, 'CLAUDE.md should still be ingested as supplement');
});

check('MERGED mode is honoured, not silently dropped', () => {
  const dir = makeWorkspace({ 'AGENTS.md': '- rule a\n', 'CLAUDE.md': '- rule c\n' });
  const spec = new AgentsSpecResolver(dir).resolveSpec(SPEC_MODES.MERGED);
  assert(spec.activeSsot === SPEC_MODES.MERGED, `expected MERGED, got ${spec.activeSsot}`);
  assert(spec.rawContent.includes('rule a') && spec.rawContent.includes('rule c'));
});

check('CLAUDE_MD_PRIMARY puts CLAUDE.md first', () => {
  const dir = makeWorkspace({ 'AGENTS.md': '- rule a\n', 'CLAUDE.md': '- rule c\n' });
  const spec = new AgentsSpecResolver(dir).resolveSpec(SPEC_MODES.CLAUDE_MD_PRIMARY);
  assert(spec.activeSsot === 'CLAUDE.md', `expected CLAUDE.md, got ${spec.activeSsot}`);
  assert(spec.rawContent.indexOf('rule c') < spec.rawContent.indexOf('rule a'));
});

check('resolves AGENTS.md from a nested subdirectory', () => {
  const dir = makeWorkspace({ 'AGENTS.md': '- root rule\n' });
  const nested = path.join(dir, 'src', 'lib');
  fs.mkdirSync(nested, { recursive: true });
  const spec = new AgentsSpecResolver(nested).resolveSpec();
  assert(spec.foundAgentsMd, 'parent walk failed to find root AGENTS.md');
  assert(spec.rawContent.includes('root rule'));
});

check('parent walk stops at a .git boundary', () => {
  const outer = makeWorkspace({ 'AGENTS.md': '- outer rule\n' });
  const inner = path.join(outer, 'nested-repo');
  fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
  const spec = new AgentsSpecResolver(inner).resolveSpec();
  assert(!spec.rawContent.includes('outer rule'),
    'parent repo rules leaked across a .git boundary');
  assert(spec.activeSsot === 'DEFAULT_INLINED');
});

check('empty workspace falls back to inlined defaults', () => {
  const dir = makeWorkspace({});
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  const spec = new AgentsSpecResolver(dir).resolveSpec();
  assert(spec.activeSsot === 'DEFAULT_INLINED');
  assert(spec.rulesCount === 0);
});

check('unknown spec mode throws', () => {
  const dir = makeWorkspace({ 'AGENTS.md': '- rule\n' });
  return throws(() => new AgentsSpecResolver(dir).resolveSpec('NOPE'));
});

check('rulesCount ignores checkbox items', () => {
  const dir = makeWorkspace({ 'AGENTS.md': '- real rule\n- [ ] a todo\n1. numbered rule\n' });
  const spec = new AgentsSpecResolver(dir).resolveSpec();
  assert(spec.rulesCount === 2, `expected 2 actionable rules, got ${spec.rulesCount}`);
});

console.log('\n--- DEX838 seam (canonical parser) ---');

check('dexcli re-exports the canonical dexspine-core parser', () => {
  const wire = formatDEX838('build', { layer: '8', urgent: true }, 'ship it');
  const parsed = parseDEX838(wire);
  assert(parsed.scope === 'build', `scope: ${parsed.scope}`);
  assert(parsed.context.layer === '8', `context.layer: ${parsed.context.layer}`);
  assert(parsed.context.urgent === true);
  assert(parsed.qualifiers, 'qualifier extraction missing — this is what the fork dropped');
});

check('canonical parser still throws on malformed input', () =>
  throws(() => parseDEX838('not an envelope')));

check('tryParseEnvelope reports failure instead of inventing an envelope', () => {
  const result = tryParseEnvelope('just some stdout prose');
  assert(result.ok === false, 'malformed input must not parse');
  assert(result.raw === 'just some stdout prose');
});

check('requiresApproval detects hardcode qualifiers for the L8 gate', () => {
  const hard = formatDEX838('deploy', { env: 'prod' }, 'run dex[force-push] now');
  const soft = formatDEX838('deploy', { env: 'prod' }, 'run dex(maybe) now');
  assert(requiresApproval(hard) === true, 'hardcode qualifier not detected');
  assert(requiresApproval(soft) === false, 'softcode wrongly flagged as needing approval');
});

console.log('\n--- DEXFILTER pipeline ---');

check('strips ANSI colour codes', () => {
  const { text } = applyDexFilter('[31mred text[0m');
  assert(text === 'red text', `got ${JSON.stringify(text)}`);
});

check('strips OSC sequences (fork\'s AnsiCleaner could not)', () => {
  const { text } = applyDexFilter(']0;window titleactual output');
  assert(text === 'actual output', `got ${JSON.stringify(text)}`);
});

check('keeps only the final frame of a carriage-return redraw', () => {
  const { text } = applyDexFilter('loading 10%\rloading 50%\rloading 100%\ndone');
  assert(!text.includes('10%'), 'intermediate spinner frames survived');
  assert(text.includes('done'));
});

check('collapses consecutive duplicate lines', () => {
  const { text, stats } = applyDexFilter('same\nsame\nsame\nother');
  assert(stats.collapsed === 2, `expected 2 collapsed, got ${stats.collapsed}`);
  assert(text === 'same\nother', `got ${JSON.stringify(text)}`);
});

check('truncation keeps head AND tail', () => {
  const input = Array.from({ length: 500 }, (_, i) => `line-${i}`).join('\n');
  const { text, stats } = applyDexFilter(input, { maxLines: 100, collapseRepeats: false });
  assert(text.includes('line-0'), 'head lost');
  assert(text.includes('line-499'), 'tail lost — errors live at the end of a stream');
  assert(text.includes('DEXFILTER'), 'no truncation marker');
  assert(stats.truncated === 400, `stats.truncated: ${stats.truncated}`);
});

check('short output passes through untruncated', () => {
  const { text, stats } = applyDexFilter('a\nb\nc');
  assert(stats.truncated === 0);
  assert(text === 'a\nb\nc');
});

check('non-string input throws instead of coercing', () =>
  throws(() => applyDexFilter({ not: 'a string' })));

check('withdrawn forked modules are gone', () => {
  const libDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'lib');
  for (const gone of ['Dex838Machining.js', 'AnsiCleaner.js']) {
    assert(!fs.existsSync(path.join(libDir, gone)),
      `${gone} is back — it forked the DEX838 grammar, see DECISIONS.md Cluster F`);
  }
});

console.log(`\n--- Phase 4 Summary: ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
