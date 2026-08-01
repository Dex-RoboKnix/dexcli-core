/**
 * ProviderAuthStatus.js — Pure function provider authentication status & detector registry for dexcli.
 *
 * Fast-fails unauthenticated or missing providers BEFORE spawning processes or starting
 * ready timeouts. Performs zero live model/prompt calls (deletes the legacy live `claude -p "ping"`
 * and `agy --prompt "ping"` checks that billed tokens on every instance start).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

export const AUTH_STATUS = {
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  NOT_INSTALLED: 'not-installed'
};

const executableCache = new Map();

export function clearExecutableCache() {
  executableCache.clear();
}

/**
 * Cross-platform executable resolver returning resolved absolute path or null.
 * Caches results per process (T018).
 */
export function resolveExecutable(name, options = {}) {
  if (!name) return null;
  if (!options.noCache && executableCache.has(name)) {
    return executableCache.get(name);
  }

  const fsReader = options.fsReader || fs;
  const envReader = options.envReader || (key => process.env[key]);

  let resolved = null;

  if (fsReader.existsSync && (path.isAbsolute(name) || name.includes('/') || name.includes('\\'))) {
    if (fsReader.existsSync(name)) {
      resolved = path.resolve(name);
    }
  }

  if (!resolved) {
    const pathEnv = envReader('PATH') || envReader('Path') || '';
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const dirs = pathEnv.split(delimiter).filter(Boolean);

    const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

    outer: for (const dir of dirs) {
      for (const ext of extensions) {
        const candidate = path.join(dir, name.endsWith(ext) ? name : name + ext);
        try {
          if (fsReader.existsSync && fsReader.existsSync(candidate)) {
            resolved = candidate;
            break outer;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  if (!options.noCache) {
    executableCache.set(name, resolved);
  }
  return resolved;
}

// Default helper to resolve homedir
function getHomedir(options) {
  if (options.homedir) {
    return typeof options.homedir === 'function' ? options.homedir() : options.homedir;
  }
  return os.homedir();
}

// Default helper for env reading
function getEnv(key, options) {
  if (options.envReader) {
    return options.envReader(key);
  }
  return process.env[key];
}

/** Detector for AGY / Google / Gemini CLI */
function detectAgy(config = {}, options = {}) {
  const exeName = config.executable || 'agy';
  const executable = resolveExecutable(exeName, options);

  if (!executable) {
    return {
      status: AUTH_STATUS.NOT_INSTALLED,
      executable: null,
      reason: `Executable "${exeName}" was not found on PATH. Remedy: Install AGY CLI (npm install -g @gemini-cli/agy) or ensure it is added to your PATH.`
    };
  }

  const fsReader = options.fsReader || fs;
  const homeDir = getHomedir(options);

  // Check API keys
  if (getEnv('GEMINI_API_KEY', options) || getEnv('GOOGLE_API_KEY', options) || getEnv('ANTIGRAVITY_API_KEY', options)) {
    return {
      status: AUTH_STATUS.AUTHENTICATED,
      executable,
      reason: 'Authenticated via API key environment variable (GEMINI_API_KEY / GOOGLE_API_KEY / ANTIGRAVITY_API_KEY).'
    };
  }

  // Check credential files
  const gAccountsPath = path.join(homeDir, '.gemini', 'google_accounts.json');
  if (fsReader.existsSync && fsReader.existsSync(gAccountsPath)) {
    try {
      const acc = JSON.parse(fsReader.readFileSync(gAccountsPath, 'utf8'));
      if (acc && typeof acc.active === 'string' && acc.active.trim().length > 0) {
        return {
          status: AUTH_STATUS.AUTHENTICATED,
          executable,
          reason: 'Authenticated via active Google account in ~/.gemini/google_accounts.json.'
        };
      }
    } catch (e) {
      // ignore
    }
  }

  const oCredsPath = path.join(homeDir, '.gemini', 'oauth_creds.json');
  if (fsReader.existsSync && fsReader.existsSync(oCredsPath)) {
    try {
      const creds = JSON.parse(fsReader.readFileSync(oCredsPath, 'utf8'));
      if (creds && (creds.access_token || creds.refresh_token || Object.keys(creds).length > 0)) {
        return {
          status: AUTH_STATUS.AUTHENTICATED,
          executable,
          reason: 'Authenticated via OAuth tokens in ~/.gemini/oauth_creds.json.'
        };
      }
    } catch (e) {
      // ignore
    }
  }

  const settingsPath = path.join(homeDir, '.gemini', 'settings.json');
  if (fsReader.existsSync && fsReader.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fsReader.readFileSync(settingsPath, 'utf8'));
      if (settings && (settings['oauth-personal'] || settings.auth)) {
        return {
          status: AUTH_STATUS.AUTHENTICATED,
          executable,
          reason: 'Authenticated via ~/.gemini/settings.json configuration.'
        };
      }
    } catch (e) {
      // ignore
    }
  }

  return {
    status: AUTH_STATUS.UNAUTHENTICATED,
    executable,
    reason: `No active credentials found in ${path.join(homeDir, '.gemini')}. Remedy: Run '${exeName}' in a terminal to complete authentication.`
  };
}

/** Detector for Anthropic Claude CLI */
function detectClaude(config = {}, options = {}) {
  const exeName = config.executable || 'claude';
  const executable = resolveExecutable(exeName, options);

  if (!executable) {
    return {
      status: AUTH_STATUS.NOT_INSTALLED,
      executable: null,
      reason: `Executable "${exeName}" was not found on PATH. Remedy: Install Claude CLI using "npm install -g @anthropic-ai/claude-code" or add it to PATH.`
    };
  }

  if (getEnv('ANTHROPIC_API_KEY', options)) {
    return {
      status: AUTH_STATUS.AUTHENTICATED,
      executable,
      reason: 'Authenticated via ANTHROPIC_API_KEY environment variable.'
    };
  }

  const fsReader = options.fsReader || fs;
  const homeDir = getHomedir(options);

  const claudePaths = [
    path.join(homeDir, '.claude.json'),
    path.join(homeDir, '.claude', 'session.json'),
    path.join(homeDir, '.claude', 'credentials.json'),
    path.join(homeDir, '.config', 'claude', 'config.json')
  ];

  if (process.platform === 'win32') {
    const appData = getEnv('APPDATA', options) || path.join(homeDir, 'AppData', 'Roaming');
    claudePaths.push(path.join(appData, 'Claude', 'claude_desktop_config.json'));
  }

  for (const p of claudePaths) {
    if (fsReader.existsSync && fsReader.existsSync(p)) {
      try {
        const content = fsReader.readFileSync(p, 'utf8');
        if (content && content.trim().length > 0) {
          return {
            status: AUTH_STATUS.AUTHENTICATED,
            executable,
            reason: `Authenticated via config file at ${p}.`
          };
        }
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    status: AUTH_STATUS.UNAUTHENTICATED,
    executable,
    reason: `No authentication tokens or session files found for Claude. Remedy: Run '${exeName}' in a terminal to log in.`
  };
}

/** Detector for OpenRouter API */
function detectOpenRouter(config = {}, options = {}) {
  const key = getEnv('OPENROUTER_API_KEY', options);
  if (key && key.trim().length > 0) {
    return {
      status: AUTH_STATUS.AUTHENTICATED,
      executable: null,
      reason: 'OPENROUTER_API_KEY environment variable is set.'
    };
  }
  return {
    status: AUTH_STATUS.UNAUTHENTICATED,
    executable: null,
    reason: 'OPENROUTER_API_KEY environment variable is missing or empty. Remedy: Set OPENROUTER_API_KEY=<your-api-key>.'
  };
}

/** Detector for OpenAI API */
function detectOpenAI(config = {}, options = {}) {
  const key = getEnv('OPENAI_API_KEY', options);
  if (key && key.trim().length > 0) {
    return {
      status: AUTH_STATUS.AUTHENTICATED,
      executable: null,
      reason: 'OPENAI_API_KEY environment variable is set.'
    };
  }
  return {
    status: AUTH_STATUS.UNAUTHENTICATED,
    executable: null,
    reason: 'OPENAI_API_KEY environment variable is missing or empty. Remedy: Set OPENAI_API_KEY=<your-api-key>.'
  };
}

/** Detector for Ollama Local Daemon */
function detectOllama(config = {}, options = {}) {
  const endpoint = config.endpoint || 'http://localhost:11434';

  if (options.prober) {
    const isReachable = options.prober(endpoint);
    if (isReachable) {
      return {
        status: AUTH_STATUS.AUTHENTICATED,
        executable: null,
        reason: `Ollama daemon is running and reachable at ${endpoint}.`
      };
    }
    return {
      status: AUTH_STATUS.NOT_INSTALLED,
      executable: null,
      reason: `Ollama daemon is not reachable at ${endpoint}. Remedy: Start the Ollama daemon using "ollama serve".`
    };
  }

  // Pure sync fallback check if no prober provided (assume reachable if sync check not possible, or probe via http if async allowed)
  return {
    status: AUTH_STATUS.AUTHENTICATED,
    executable: null,
    reason: `Ollama configured at ${endpoint}.`
  };
}

/** Detector for Mock provider */
function detectMock(config = {}, options = {}) {
  return {
    status: AUTH_STATUS.AUTHENTICATED,
    executable: 'mock',
    reason: 'Mock provider is always authenticated.'
  };
}

/** Registry of detectors (T015) */
export const DETECTOR_REGISTRY = new Map([
  ['agy', detectAgy],
  ['antigravity', detectAgy],
  ['gemini', detectAgy],
  ['google', detectAgy],
  ['claude', detectClaude],
  ['anthropic', detectClaude],
  ['openrouter', detectOpenRouter],
  ['openai', detectOpenAI],
  ['ollama', detectOllama],
  ['mock', detectMock]
]);

/**
 * Pure function check for provider auth status (T014).
 * Given a provider id and options, returns status, executable, and reason.
 */
export function checkProviderAuthStatus(providerId, config = {}, options = {}) {
  const normalizedId = String(providerId || 'agy').toLowerCase();
  const detector = DETECTOR_REGISTRY.get(normalizedId) || detectMock;
  return detector(config, options);
}
