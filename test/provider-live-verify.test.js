import assert from 'node:assert';
import { EventEmitter } from 'events';
import {
  verifyLiveAuth,
  verifyApiKey,
  verifyPtyRepl,
  verifyLocalDaemon,
  VERIFY_RESULT
} from '../src/lib/ProviderLiveVerify.js';
import { AUTH_METHODS } from '../src/lib/ProviderRegistry.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  return child;
}

async function testProviderLiveVerify() {
  console.log('--- ProviderLiveVerify (T-07) Unit Tests ---');

  // api_key: accepted key (2xx)
  {
    const outcome = await verifyApiKey('openrouter', 'sk-good', {
      httpsGet: async () => ({ statusCode: 200 })
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.VERIFIED);
  }
  console.log('✅ api_key: 2xx -> verified');

  // api_key: rejected key (401)
  {
    const outcome = await verifyApiKey('openrouter', 'sk-bad', {
      httpsGet: async () => ({ statusCode: 401 })
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ api_key: 401 -> failed');

  // api_key: no key entered
  {
    const outcome = await verifyApiKey('openrouter', '', {});
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ api_key: empty key -> failed without network call');

  // api_key: unregistered provider
  {
    const outcome = await verifyApiKey('some-unknown-provider', 'sk-x', {});
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
    assert.ok(/no live api_key verification endpoint/i.test(outcome.reason));
  }
  console.log('✅ api_key: unregistered provider -> failed');

  // api_key: network error
  {
    const outcome = await verifyApiKey('openai', 'sk-x', {
      httpsGet: async () => { throw new Error('ECONNRESET'); }
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
    assert.ok(outcome.reason.includes('ECONNRESET'));
  }
  console.log('✅ api_key: network error -> failed with reason');

  // pty_repl: success marker
  {
    const spawner = () => {
      const child = fakeChild();
      setImmediate(() => {
        child.stdout.emit('data', 'Logged in as user@example.com\n');
      });
      return child;
    };
    const outcome = await verifyPtyRepl('anthropic', { executable: 'claude', spawner, timeoutMs: 500 });
    assert.strictEqual(outcome.result, VERIFY_RESULT.VERIFIED);
  }
  console.log('✅ pty_repl: login marker -> verified');

  // pty_repl: failure marker
  {
    const spawner = () => {
      const child = fakeChild();
      setImmediate(() => {
        child.stdout.emit('data', 'Not logged in. Please run /login\n');
      });
      return child;
    };
    const outcome = await verifyPtyRepl('anthropic', { executable: 'claude', spawner, timeoutMs: 500 });
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ pty_repl: auth-failure marker -> failed');

  // pty_repl: timeout with no marker
  {
    const spawner = () => fakeChild(); // never emits anything
    const outcome = await verifyPtyRepl('anthropic', { executable: 'claude', spawner, timeoutMs: 50 });
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
    assert.ok(/no live-session marker/i.test(outcome.reason));
  }
  console.log('✅ pty_repl: timeout -> failed');

  // pty_repl: missing executable
  {
    const outcome = await verifyPtyRepl('anthropic', {});
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ pty_repl: no executable configured -> failed');

  // local_daemon: reachable
  {
    const outcome = await verifyLocalDaemon('ollama', 'http://localhost:11434', {
      httpGet: async () => ({ statusCode: 200 })
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.VERIFIED);
  }
  console.log('✅ local_daemon: reachable -> verified');

  // local_daemon: unreachable
  {
    const outcome = await verifyLocalDaemon('ollama', 'http://localhost:11434', {
      httpGet: async () => { throw new Error('ECONNREFUSED'); }
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ local_daemon: unreachable -> failed');

  // local_daemon: server error
  {
    const outcome = await verifyLocalDaemon('ollama', 'http://localhost:11434', {
      httpGet: async () => ({ statusCode: 500 })
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ local_daemon: 5xx -> failed');

  // subscription_browser: always skipped, never attempted
  {
    const outcome = await verifyLiveAuth('anthropic', AUTH_METHODS.SUBSCRIPTION_BROWSER, 'irrelevant', {
      httpsGet: async () => { throw new Error('should never be called'); },
      httpGet: async () => { throw new Error('should never be called'); },
      spawner: () => { throw new Error('should never be called'); }
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.SKIPPED);
  }
  console.log('✅ subscription_browser: always skipped, no live call attempted');

  // dispatch: unknown auth method
  {
    const outcome = await verifyLiveAuth('x', 'not_a_real_method', null, {});
    assert.strictEqual(outcome.result, VERIFY_RESULT.FAILED);
  }
  console.log('✅ unknown auth method -> failed');

  console.log('--- ProviderLiveVerify Unit Tests Passed ---');
}

testProviderLiveVerify().catch(err => {
  console.error('❌ ProviderLiveVerify test failed:', err);
  process.exit(1);
});
