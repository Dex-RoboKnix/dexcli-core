import { geminiProvider } from './gemini.js';
import { mockProvider } from './mock.js';
import { claudeProvider } from './claude.js';
import { PROVIDER_TYPES } from '../lib/ProviderRegistry.js';

const providers = new Map();
providers.set('gemini', geminiProvider);
providers.set('mock', mockProvider);
providers.set('claude', claudeProvider);

export function getProvider(name) {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Provider "${name}" not found in registry`);
  }
  return provider;
}

export function registerProvider(name, provider) {
  providers.set(name, provider);
}

/**
 * Bridge between ProviderRegistry.PROVIDER_TYPES (vendor identity — "which company")
 * and this directory's strategy modules (spawn identity — "how do I talk to a PTY").
 * ProviderRegistry answers role -> {providerId, modelId}; CliPool needs role -> spawn
 * strategy, so this map is the seam between the two vocabularies. Vendors without a
 * PTY_REPL strategy yet (openrouter/openai — API_KEY auth, no CLI REPL to drive) fall
 * back to 'mock' rather than throwing, so an unimplemented provider degrades to a
 * visibly-fake instance instead of crashing the pool.
 */
export const PROVIDER_ID_TO_STRATEGY = {
  [PROVIDER_TYPES.GOOGLE]: 'gemini',
  [PROVIDER_TYPES.ANTHROPIC]: 'claude',
  [PROVIDER_TYPES.OPENROUTER]: 'mock',
  [PROVIDER_TYPES.OPENAI]: 'mock',
  [PROVIDER_TYPES.OLLAMA]: 'mock'
};

export function strategyForProviderId(providerId) {
  return PROVIDER_ID_TO_STRATEGY[providerId] || 'mock';
}
