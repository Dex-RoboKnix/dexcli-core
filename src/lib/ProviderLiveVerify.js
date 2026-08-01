/**
 * ProviderLiveVerify.js — live auth verification for `dexcli setup` (T-07).
 *
 * ProviderAuthStatus.js answers "does a plausible credential exist on disk/env" as a pure,
 * zero-network check used on every CliInstance start (fast, no billing, no side effects).
 * This module answers a different, narrower question asked only during the interactive
 * setup wizard: "does the credential the operator just typed/selected actually work?" —
 * one real network call or CLI spawn per verification, never on the hot path.
 *
 * Each verifier is dependency-injectable (httpRequester / spawner / prober) so tests never
 * hit a real network or spawn a real process; the exported default functions are the ones
 * SetupWizard uses in production.
 *
 * subscription_browser is intentionally excluded — see ProviderRegistry.AUTH_METHODS and
 * the ADR note in HANDOFF.md. Callers must not add a verifier for it; `verifyLiveAuth`
 * returns a `{ skipped: true }` result rather than attempting one.
 */

import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { AUTH_METHODS } from './ProviderRegistry.js';

export const VERIFY_RESULT = {
  VERIFIED: 'verified',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/** Minimal per-provider "am I authenticated" endpoints for the api_key path. */
const API_KEY_VERIFY_ENDPOINTS = {
  openrouter: { hostname: 'openrouter.ai', path: '/api/v1/auth/key', headerName: 'Authorization', headerPrefix: 'Bearer ' },
  openai: { hostname: 'api.openai.com', path: '/v1/models', headerName: 'Authorization', headerPrefix: 'Bearer ' }
};

/** Default HTTPS GET, resolving to { statusCode }. Injectable for tests. */
function defaultHttpsGet({ hostname, path: reqPath, headers }, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: reqPath, method: 'GET', headers, timeout: timeoutMs }, res => {
      res.resume(); // drain, we only need the status
      resolve({ statusCode: res.statusCode });
    });
    req.on('timeout', () => req.destroy(new Error(`Request to ${hostname}${reqPath} timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end();
  });
}

/** Default local HTTP health probe. Injectable for tests. */
function defaultHttpGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      res.resume();
      resolve({ statusCode: res.statusCode });
    });
    req.on('timeout', () => req.destroy(new Error(`Request to ${url} timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
  });
}

/**
 * api_key: fire one minimal, side-effect-free authenticated request against the provider's
 * API using the entered key. A 2xx/401-distinguishing response is enough — we don't need
 * the response body, just proof the key is accepted.
 */
export async function verifyApiKey(providerId, apiKey, { httpsGet = defaultHttpsGet } = {}) {
  if (!apiKey || !String(apiKey).trim()) {
    return { result: VERIFY_RESULT.FAILED, reason: 'No API key provided.' };
  }
  const endpoint = API_KEY_VERIFY_ENDPOINTS[providerId];
  if (!endpoint) {
    return { result: VERIFY_RESULT.FAILED, reason: `No live api_key verification endpoint registered for provider "${providerId}".` };
  }
  try {
    const { statusCode } = await httpsGet({
      hostname: endpoint.hostname,
      path: endpoint.path,
      headers: { [endpoint.headerName]: `${endpoint.headerPrefix}${apiKey}` }
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { result: VERIFY_RESULT.VERIFIED, reason: `Key accepted by ${endpoint.hostname} (HTTP ${statusCode}).` };
    }
    if (statusCode === 401 || statusCode === 403) {
      return { result: VERIFY_RESULT.FAILED, reason: `Key rejected by ${endpoint.hostname} (HTTP ${statusCode}).` };
    }
    return { result: VERIFY_RESULT.FAILED, reason: `Unexpected response from ${endpoint.hostname}: HTTP ${statusCode}.` };
  } catch (err) {
    return { result: VERIFY_RESULT.FAILED, reason: `Request to ${endpoint.hostname} failed: ${err.message}` };
  }
}

/**
 * pty_repl: spawn the provider CLI and watch its output buffer for a marker proving a live,
 * logged-in session (as opposed to a login prompt / auth-error banner). Uses a short-lived
 * plain child_process (not a full PTY — we don't need a terminal, just enough output to
 * pattern-match) and always kills it once a verdict is reached or the timeout elapses.
 */
export async function verifyPtyRepl(providerId, { executable, args = ['--version'], successPatterns, failurePatterns, timeoutMs = 8000, spawner = spawn } = {}) {
  if (!executable) {
    return { result: VERIFY_RESULT.FAILED, reason: 'No executable configured for this provider.' };
  }
  const success = successPatterns || [/\d+\.\d+\.\d+/, /logged in/i, /authenticated/i];
  const failure = failurePatterns || [/not logged in/i, /please (run|log)\s*\/?login/i, /no api key/i, /unauthorized/i, /please authenticate/i];

  return new Promise(resolve => {
    let buffer = '';
    let settled = false;
    let child;
    try {
      child = spawner(executable, args, { shell: process.platform === 'win32' });
    } catch (err) {
      resolve({ result: VERIFY_RESULT.FAILED, reason: `Failed to spawn "${executable}": ${err.message}` });
      return;
    }

    const finish = (result, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch (e) { /* ignore */ }
      resolve({ result, reason });
    };

    const onChunk = chunk => {
      buffer += chunk.toString();
      if (failure.some(re => re.test(buffer))) {
        finish(VERIFY_RESULT.FAILED, `Provider CLI reported an auth failure: matched "${buffer.trim().slice(0, 200)}"`);
        return;
      }
      if (success.some(re => re.test(buffer))) {
        finish(VERIFY_RESULT.VERIFIED, `Provider CLI produced a live-session marker: "${buffer.trim().slice(0, 200)}"`);
      }
    };

    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.on('error', err => finish(VERIFY_RESULT.FAILED, `Provider CLI process error: ${err.message}`));
    child.on('exit', code => {
      if (settled) return;
      if (code === 0 && success.some(re => re.test(buffer))) {
        finish(VERIFY_RESULT.VERIFIED, `Provider CLI exited 0 with a live-session marker.`);
      } else {
        finish(VERIFY_RESULT.FAILED, `Provider CLI exited (code ${code}) without a live-session marker. Output: ${buffer.trim().slice(0, 200) || '(none)'}`);
      }
    });

    const timer = setTimeout(() => {
      finish(VERIFY_RESULT.FAILED, `No live-session marker seen within ${timeoutMs}ms. Output so far: ${buffer.trim().slice(0, 200) || '(none)'}`);
    }, timeoutMs);
  });
}

/** local_daemon: ping the daemon's health endpoint. */
export async function verifyLocalDaemon(providerId, endpoint, { httpGet = defaultHttpGet } = {}) {
  if (!endpoint) {
    return { result: VERIFY_RESULT.FAILED, reason: 'No daemon endpoint configured.' };
  }
  try {
    const { statusCode } = await httpGet(endpoint);
    if (statusCode >= 200 && statusCode < 500) {
      // Any response at all (even a 404 on the wrong route) proves something is listening;
      // treat 5xx as the daemon being up but unhealthy, which should fail verification.
      return { result: VERIFY_RESULT.VERIFIED, reason: `Daemon responded at ${endpoint} (HTTP ${statusCode}).` };
    }
    return { result: VERIFY_RESULT.FAILED, reason: `Daemon at ${endpoint} responded with server error HTTP ${statusCode}.` };
  } catch (err) {
    return { result: VERIFY_RESULT.FAILED, reason: `Could not reach daemon at ${endpoint}: ${err.message}` };
  }
}

/**
 * Dispatch by auth method. `credential` is method-specific:
 *   api_key       -> the key string
 *   pty_repl      -> { executable, args? }
 *   local_daemon  -> endpoint URL string
 *   subscription_browser -> ignored, always skipped (unimplemented by design)
 */
export async function verifyLiveAuth(providerId, authMethod, credential, deps = {}) {
  switch (authMethod) {
    case AUTH_METHODS.API_KEY:
      return verifyApiKey(providerId, credential, deps);
    case AUTH_METHODS.PTY_REPL:
      return verifyPtyRepl(providerId, credential || {}, deps);
    case AUTH_METHODS.LOCAL_DAEMON:
      return verifyLocalDaemon(providerId, credential, deps);
    case AUTH_METHODS.SUBSCRIPTION_BROWSER:
      return { result: VERIFY_RESULT.SKIPPED, reason: 'subscription_browser auth is declared but intentionally unimplemented — live verification skipped.' };
    default:
      return { result: VERIFY_RESULT.FAILED, reason: `Unknown auth method "${authMethod}" — cannot verify.` };
  }
}
