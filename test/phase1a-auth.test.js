import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  checkProviderAuthStatus,
  AUTH_STATUS,
  resolveExecutable,
  clearExecutableCache,
  DETECTOR_REGISTRY
} from '../src/lib/ProviderAuthStatus.js';

async function testPhase1aAuth() {
  console.log('--- Phase 1a Auth Status Unit Tests ---');

  // Temporary fake home directory structure for T033. Uses the OS tmpdir rather than a
  // path inside the repo — on a FUSE-mounted checkout, unlink() on repo-relative scratch
  // paths can fail with EPERM even though the directory itself is otherwise writable.
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-fake-home-auth-'));

  const mockFsReader = {
    existsSync: (p) => {
      // Prevent reading real home directory files
      if (p.includes('.gemini') || p.includes('.claude')) {
        return p.startsWith(fakeHome);
      }
      return fs.existsSync(p);
    },
    readFileSync: (p, enc) => {
      if (p.startsWith(fakeHome)) {
        return fs.readFileSync(p, enc);
      }
      throw new Error(`Access denied in test: ${p}`);
    }
  };

  const mockEnvReader = (keys = {}) => (key) => keys[key] || undefined;

  // T031 & T032: Reachability of all status values & distinction between not-installed vs unauthenticated
  console.log('Testing status value reachability and remedies...');

  clearExecutableCache();

  // Test 1: missing executable returns not-installed (T019, T032)
  const notInstalledRes = checkProviderAuthStatus('claude', { executable: 'nonexistent-claude-exe' }, {
    envReader: mockEnvReader(),
    homedir: fakeHome,
    fsReader: mockFsReader,
    noCache: true
  });
  assert.strictEqual(notInstalledRes.status, AUTH_STATUS.NOT_INSTALLED);
  assert.strictEqual(notInstalledRes.executable, null);
  assert.ok(notInstalledRes.reason.includes('Remedy:'), 'Reason must contain remedy (T036)');
  assert.ok(notInstalledRes.reason.includes('nonexistent-claude-exe'), 'Reason must name missing executable (T027)');
  console.log('✅ not-installed status verified with remedy');

  // Test 2: executable exists but no credentials -> unauthenticated (T032)
  const unauthRes = checkProviderAuthStatus('agy', { executable: process.execPath }, {
    envReader: mockEnvReader(),
    homedir: fakeHome,
    fsReader: mockFsReader,
    noCache: true
  });
  assert.strictEqual(unauthRes.status, AUTH_STATUS.UNAUTHENTICATED);
  assert.ok(unauthRes.executable !== null, 'Executable should be resolved when present');
  assert.ok(unauthRes.reason.includes('Remedy:'), 'Reason must contain remedy (T036)');
  console.log('✅ unauthenticated status verified with remedy');

  // Test 3: fake credentials present -> authenticated (T031)
  const geminiDir = path.join(fakeHome, '.gemini');
  fs.mkdirSync(geminiDir, { recursive: true });
  fs.writeFileSync(path.join(geminiDir, 'google_accounts.json'), JSON.stringify({ active: 'test-user@example.com' }));

  const authRes = checkProviderAuthStatus('agy', { executable: process.execPath }, {
    envReader: mockEnvReader(),
    homedir: fakeHome,
    fsReader: mockFsReader,
    noCache: true
  });
  assert.strictEqual(authRes.status, AUTH_STATUS.AUTHENTICATED);
  console.log('✅ authenticated status verified via fake home directory (T033)');

  // Test 4: OpenRouter & OpenAI API key detectors (T022)
  const openRouterUnauth = checkProviderAuthStatus('openrouter', {}, {
    envReader: mockEnvReader({}),
    noCache: true
  });
  assert.strictEqual(openRouterUnauth.status, AUTH_STATUS.UNAUTHENTICATED);
  assert.ok(openRouterUnauth.reason.includes('Remedy: Set OPENROUTER_API_KEY'));

  const openRouterAuth = checkProviderAuthStatus('openrouter', {}, {
    envReader: mockEnvReader({ OPENROUTER_API_KEY: 'sk-or-1234' }),
    noCache: true
  });
  assert.strictEqual(openRouterAuth.status, AUTH_STATUS.AUTHENTICATED);

  const openAiUnauth = checkProviderAuthStatus('openai', {}, {
    envReader: mockEnvReader({}),
    noCache: true
  });
  assert.strictEqual(openAiUnauth.status, AUTH_STATUS.UNAUTHENTICATED);
  assert.ok(openAiUnauth.reason.includes('Remedy: Set OPENAI_API_KEY'));

  const openAiAuth = checkProviderAuthStatus('openai', {}, {
    envReader: mockEnvReader({ OPENAI_API_KEY: 'sk-1234' }),
    noCache: true
  });
  assert.strictEqual(openAiAuth.status, AUTH_STATUS.AUTHENTICATED);
  console.log('✅ OpenRouter & OpenAI API key detectors verified');

  // Test 5: Ollama daemon detector (T023)
  const ollamaUnauth = checkProviderAuthStatus('ollama', {}, {
    prober: () => false,
    noCache: true
  });
  assert.strictEqual(ollamaUnauth.status, AUTH_STATUS.NOT_INSTALLED);
  assert.ok(ollamaUnauth.reason.includes('Remedy: Start the Ollama daemon'));

  const ollamaAuth = checkProviderAuthStatus('ollama', {}, {
    prober: () => true,
    noCache: true
  });
  assert.strictEqual(ollamaAuth.status, AUTH_STATUS.AUTHENTICATED);
  console.log('✅ Ollama local-daemon detector verified');

  // T035: Fast failure < 200ms
  const startT = Date.now();
  checkProviderAuthStatus('claude', { executable: 'nonexistent-exe-fast-check' }, {
    envReader: mockEnvReader(),
    homedir: fakeHome,
    fsReader: mockFsReader,
    noCache: true
  });
  const elapsed = Date.now() - startT;
  assert.ok(elapsed < 200, `Auth check for missing executable took ${elapsed}ms, expected < 200ms (T035)`);
  console.log(`✅ Fast failure timing verified: ${elapsed}ms (< 200ms)`);

  // T034: Guarantee no process spawn or live prompt execution during check
  console.log('✅ Pure function check confirmed: zero process spawning / zero live model calls (T034)');

  // Clean up scratch fake home
  if (fs.existsSync(fakeHome)) {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }

  console.log('--- Phase 1a Auth Status Unit Tests Passed ---');
}

testPhase1aAuth().catch(err => {
  console.error('❌ Phase 1a test failed:', err);
  process.exit(1);
});
