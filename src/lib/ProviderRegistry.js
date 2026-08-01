/**
 * ProviderRegistry.js — Multi-provider & role-mapping registry for dexcli.
 *
 * Answers one question for the orchestrator: "for role R, which provider, which model,
 * and how do I authenticate?" Every provider/model decision in dexcli routes through here,
 * so that swapping Gemini for Ollama on the implementation role is a config change and not
 * a code change.
 *
 * Model IDs below are DEFAULTS, not a supported-model list — they go stale as vendors ship.
 * `setRoleMapping()` accepts any model string the provider will honour; the defaults exist
 * so a fresh install runs without a setup pass.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export const PROVIDER_TYPES = {
  GOOGLE: 'google',
  ANTHROPIC: 'anthropic',
  OPENROUTER: 'openrouter',
  OLLAMA: 'ollama',
  OPENAI: 'openai'
};

export const AUTH_METHODS = {
  SUBSCRIPTION_BROWSER: 'subscription_browser', // Playwright persistent context — see ADR risk note in HANDOFF
  PTY_REPL: 'pty_repl',                         // Native CLI persistent REPL (gemini chat / claude)
  API_KEY: 'api_key',                           // Standard REST API key
  LOCAL_DAEMON: 'local_daemon'                  // Local daemon (e.g. Ollama localhost:11434)
};

export const AGENT_ROLES = {
  ORCHESTRATOR: 'orchestrator',                       // L1 — architecture, decomposition, HITL governance
  SUBAGENT_IMPLEMENTATION: 'subagent_implementation', // L2 — heavy code writing & batch file edits
  SUBAGENT_REVIEWER: 'subagent_reviewer',             // L2 — code review & spec validation
  SUBAGENT_RESEARCHER: 'subagent_researcher'          // L2 — research, search, context indexing
};

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.dexcli', 'providers.json');

function defaultProviders() {
  return {
    [PROVIDER_TYPES.ANTHROPIC]: {
      id: PROVIDER_TYPES.ANTHROPIC,
      name: 'Anthropic Claude',
      authMethod: AUTH_METHODS.PTY_REPL,
      enabled: true,
      defaultModel: 'claude-sonnet-4-5',
      models: ['claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5']
    },
    [PROVIDER_TYPES.GOOGLE]: {
      id: PROVIDER_TYPES.GOOGLE,
      name: 'Google AI Pro (Gemini)',
      authMethod: AUTH_METHODS.PTY_REPL,
      enabled: true,
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash']
    },
    [PROVIDER_TYPES.OPENROUTER]: {
      id: PROVIDER_TYPES.OPENROUTER,
      name: 'OpenRouter Unified API',
      authMethod: AUTH_METHODS.API_KEY,
      enabled: false,
      defaultModel: 'anthropic/claude-sonnet-4.5',
      models: ['anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro', 'deepseek/deepseek-r1']
    },
    [PROVIDER_TYPES.OPENAI]: {
      id: PROVIDER_TYPES.OPENAI,
      name: 'OpenAI',
      authMethod: AUTH_METHODS.API_KEY,
      enabled: false,
      defaultModel: 'gpt-4.1',
      models: ['gpt-4.1', 'o4-mini']
    },
    [PROVIDER_TYPES.OLLAMA]: {
      id: PROVIDER_TYPES.OLLAMA,
      name: 'Ollama Local Daemon',
      authMethod: AUTH_METHODS.LOCAL_DAEMON,
      enabled: false,
      endpoint: 'http://localhost:11434',
      defaultModel: 'qwen2.5-coder:32b',
      models: ['llama3:70b', 'qwen2.5-coder:32b']
    }
  };
}

function defaultRoleMappings() {
  return {
    [AGENT_ROLES.ORCHESTRATOR]: {
      providerId: PROVIDER_TYPES.ANTHROPIC,
      modelId: 'claude-sonnet-4-5',
      description: 'L1 Orchestrator — architecture, decomposition & HITL governance'
    },
    [AGENT_ROLES.SUBAGENT_IMPLEMENTATION]: {
      providerId: PROVIDER_TYPES.GOOGLE,
      modelId: 'gemini-2.5-flash',
      description: 'L2 Sub-agent — heavy execution, codebase indexing & file edits'
    },
    [AGENT_ROLES.SUBAGENT_REVIEWER]: {
      providerId: PROVIDER_TYPES.ANTHROPIC,
      modelId: 'claude-sonnet-4-5',
      description: 'L2 Sub-agent — code review & spec validation'
    },
    [AGENT_ROLES.SUBAGENT_RESEARCHER]: {
      providerId: PROVIDER_TYPES.GOOGLE,
      modelId: 'gemini-2.5-pro',
      description: 'L2 Sub-agent — deep research & context extraction'
    }
  };
}

/** Merge that preserves sibling keys of a partially-overridden provider entry. */
function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    out[key] = (value && typeof value === 'object' && !Array.isArray(value) &&
                base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]))
      ? deepMerge(base[key], value)
      : value;
  }
  return out;
}

export class ProviderRegistry {
  constructor(initialConfig = {}) {
    this.providers = deepMerge(defaultProviders(), initialConfig.providers);
    this.roleMappings = deepMerge(defaultRoleMappings(), initialConfig.roleMappings);
  }

  /**
   * Resolve a role to a concrete execution target.
   * Throws on unknown role or dangling provider reference — a silent `authMethod: 'unknown'`
   * would surface as a confusing PTY spawn failure much later.
   */
  getRoleConfig(role) {
    const mapping = this.roleMappings[role];
    if (!mapping) {
      throw new Error(
        `Unknown agent role: "${role}". Known roles: ${Object.keys(this.roleMappings).join(', ')}`
      );
    }

    const provider = this.providers[mapping.providerId];
    if (!provider) {
      throw new Error(
        `Role "${role}" maps to unregistered provider "${mapping.providerId}". ` +
        `Registered providers: ${Object.keys(this.providers).join(', ')}`
      );
    }

    return {
      role,
      providerId: provider.id,
      providerName: provider.name,
      authMethod: provider.authMethod,
      enabled: provider.enabled,
      endpoint: provider.endpoint,
      modelId: mapping.modelId || provider.defaultModel,
      description: mapping.description
    };
  }

  setRoleMapping(role, providerId, modelId) {
    if (!this.providers[providerId]) {
      throw new Error(
        `Cannot map role "${role}" to unknown provider "${providerId}". ` +
        `Registered providers: ${Object.keys(this.providers).join(', ')}`
      );
    }
    this.roleMappings[role] = {
      ...(this.roleMappings[role] || { description: `Custom role: ${role}` }),
      providerId,
      modelId
    };
    return this.roleMappings[role];
  }

  setProviderEnabled(providerId, enabled) {
    const provider = this.providers[providerId];
    if (!provider) throw new Error(`Unknown provider: "${providerId}"`);
    provider.enabled = Boolean(enabled);
    return provider;
  }

  listProviders({ enabledOnly = false } = {}) {
    return Object.values(this.providers).filter(p => !enabledOnly || p.enabled);
  }

  listRoles() {
    return Object.keys(this.roleMappings);
  }

  /**
   * Every role must resolve to a registered AND enabled provider before the swarm starts.
   * Returns problems rather than throwing so the setup wizard can show them all at once.
   */
  validate() {
    const problems = [];
    for (const [role, mapping] of Object.entries(this.roleMappings)) {
      const provider = this.providers[mapping.providerId];
      if (!provider) {
        problems.push(`Role "${role}" → unregistered provider "${mapping.providerId}"`);
        continue;
      }
      if (!provider.enabled) {
        problems.push(`Role "${role}" → provider "${provider.name}" is disabled`);
      }
      if (!mapping.modelId && !provider.defaultModel) {
        problems.push(`Role "${role}" has no model and provider "${provider.name}" has no default`);
      }
    }
    return { valid: problems.length === 0, problems };
  }

  exportConfig() {
    return { providers: this.providers, roleMappings: this.roleMappings };
  }

  save(configPath = DEFAULT_CONFIG_PATH) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(this.exportConfig(), null, 2), 'utf8');
    return configPath;
  }

  /** Load persisted config, falling back to defaults when absent (first run). */
  static load(configPath = DEFAULT_CONFIG_PATH) {
    if (!fs.existsSync(configPath)) return new ProviderRegistry();
    try {
      return new ProviderRegistry(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    } catch (error) {
      throw new Error(`Malformed provider config at ${configPath}: ${error.message}`);
    }
  }
}
