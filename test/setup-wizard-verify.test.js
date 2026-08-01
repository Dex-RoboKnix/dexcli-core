import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SetupWizard } from '../src/lib/SetupWizard.js';
import { VERIFY_RESULT } from '../src/lib/ProviderLiveVerify.js';

async function testSetupWizardVerify() {
  console.log('--- SetupWizard live-verify (T-07) Unit Tests ---');

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-setup-wizard-'));
  const configPath = path.join(scratchDir, 'providers.json');

  // Fresh install: no providers.json yet.
  {
    const wizard = new SetupWizard({ configPath });
    assert.strictEqual(wizard.preExisting, false);
  }
  console.log('✅ fresh install detected (preExisting = false)');

  // verifyProvider: api_key path, injected deps, accepted key.
  {
    const wizard = new SetupWizard({ configPath });
    wizard.registry.setProviderEnabled('openrouter', true);
    const outcome = await wizard.verifyProvider('openrouter', 'sk-test-good', {
      httpsGet: async () => ({ statusCode: 200 })
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.VERIFIED);
    assert.strictEqual(wizard.verificationResults.openrouter.result, VERIFY_RESULT.VERIFIED);
  }
  console.log('✅ verifyProvider(api_key) caches result on wizard');

  // verifyProvider: unknown provider throws.
  {
    const wizard = new SetupWizard({ configPath });
    await assert.rejects(() => wizard.verifyProvider('not-a-provider', 'x', {}));
  }
  console.log('✅ verifyProvider on unknown provider throws');

  // verifyProvider: subscription_browser is skipped, not attempted as a real call.
  {
    const wizard = new SetupWizard({ configPath });
    // Force a provider onto subscription_browser to exercise the skip path even though no
    // default provider uses it today.
    wizard.registry.providers.anthropic.authMethod = 'subscription_browser';
    const outcome = await wizard.verifyProvider('anthropic', null, {
      spawner: () => { throw new Error('must not be called'); }
    });
    assert.strictEqual(outcome.result, VERIFY_RESULT.SKIPPED);
  }
  console.log('✅ verifyProvider(subscription_browser) skips without attempting a live call');

  // verifyAllEnabled: mixed pass/fail across enabled providers only.
  {
    const wizard = new SetupWizard({ configPath });
    wizard.registry.setProviderEnabled('google', true);
    wizard.registry.setProviderEnabled('anthropic', true);
    wizard.registry.setProviderEnabled('openrouter', false); // disabled -> not checked

    const { results } = await wizard.verifyAllEnabled({
      deps: {
        // google & anthropic both default to pty_repl; force a deterministic FAILED result
        // via an injected spawner rather than depending on real CLIs being installed in CI.
        spawner: () => { throw new Error('no CLI available in test sandbox'); }
      }
    });
    // We're asserting disabled providers are excluded, not asserting pass/fail of the live
    // spawn call itself (that's covered by ProviderLiveVerify's own test file).
    assert.ok('google' in results);
    assert.ok('anthropic' in results);
    assert.ok(!('openrouter' in results), 'disabled provider must not be verified');
  }
  console.log('✅ verifyAllEnabled only checks enabled providers');

  // reviewExisting: returns a summary for the re-run flow.
  {
    const wizard = new SetupWizard({ configPath });
    const summary = wizard.reviewExisting();
    assert.ok(Array.isArray(summary));
    assert.ok(summary.length > 0);
    for (const entry of summary) {
      assert.ok('providerId' in entry);
      assert.ok('savedStatus' in entry);
    }
  }
  console.log('✅ reviewExisting returns per-provider saved-status summary');

  // preExisting flips true once a config has been saved.
  {
    const wizard = new SetupWizard({ configPath });
    wizard.registry.save(configPath);
    const wizard2 = new SetupWizard({ configPath });
    assert.strictEqual(wizard2.preExisting, true);
  }
  console.log('✅ preExisting = true once providers.json exists on disk');

  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log('--- SetupWizard live-verify Unit Tests Passed ---');
}

testSetupWizardVerify().catch(err => {
  console.error('❌ SetupWizard live-verify test failed:', err);
  process.exit(1);
});
