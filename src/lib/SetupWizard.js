/**
 * SetupWizard.js — interactive `dexcli setup` provider/role wizard.
 *
 * Walks the operator through ProviderRegistry: toggle which providers are enabled,
 * assign a provider+model to each of the four agent roles, then validate() the whole
 * mapping and show every problem at once (never fail on the first one) before persisting
 * via ProviderRegistry.save(). Built on `blessed`, already a dependency (see TUI.js for
 * the same pattern in the main app).
 *
 * T-07: toggling `enabled` and picking role mappings used to be all this wizard did —
 * it never proved the credential actually worked. Before persisting, every *enabled*
 * provider (except subscription_browser, intentionally unimplemented — see
 * ProviderRegistry.AUTH_METHODS) must pass a live check via ProviderLiveVerify.js:
 * api_key fires a minimal authenticated request, pty_repl spawns the provider CLI and
 * watches for a login/session marker, local_daemon pings the health endpoint.
 *
 * T-07 also changes the re-run story: if `~/.dexcli/providers.json` already has entries
 * when the wizard starts, the operator is shown each provider's saved status and chooses
 * skip (keep as-is, no re-verification) vs replace (re-enter/re-verify) per provider,
 * rather than being forced through a full re-walk of every provider every time.
 */

import fs from 'fs';
import blessed from 'blessed';
import { ProviderRegistry, AGENT_ROLES, AUTH_METHODS, DEFAULT_CONFIG_PATH } from './ProviderRegistry.js';
import { verifyLiveAuth, VERIFY_RESULT } from './ProviderLiveVerify.js';

/** Default CLI executable per provider id, used for the pty_repl live-verify spawn. */
const DEFAULT_EXECUTABLE = {
  anthropic: 'claude',
  google: 'gemini'
};

export class SetupWizard {
  constructor({ configPath } = {}) {
    this.configPath = configPath;
    // Captured before load() so the wizard can tell "fresh install" apart from "re-run
    // against an existing config" — load() itself returns a populated registry either way.
    this.preExisting = fs.existsSync(configPath || DEFAULT_CONFIG_PATH);
    this.registry = ProviderRegistry.load(configPath);
    this.screen = null;
    // providerId -> { result, reason, skipped } from the most recent live-verify pass or
    // an explicit "skip, keep saved status" choice during the re-run review.
    this.verificationResults = {};
  }

  /** Non-interactive entry point used by tests / --check. Returns validate()'s result. */
  check() {
    return this.registry.validate();
  }

  /**
   * Build the credential payload ProviderLiveVerify.verifyLiveAuth expects for a given
   * provider, given whatever the operator entered (or defaults for methods that don't
   * need operator input, like pty_repl / local_daemon).
   */
  _credentialFor(provider, entered) {
    switch (provider.authMethod) {
      case AUTH_METHODS.API_KEY:
        return entered;
      case AUTH_METHODS.PTY_REPL:
        return { executable: (entered && entered.executable) || DEFAULT_EXECUTABLE[provider.id] || provider.id };
      case AUTH_METHODS.LOCAL_DAEMON:
        return provider.endpoint;
      default:
        return entered;
    }
  }

  /**
   * Live-verify one provider. Skips (rather than fails) subscription_browser by design.
   * `entered` is method-specific operator input — an API key string for api_key, nothing
   * required for pty_repl/local_daemon. Result is cached on this.verificationResults.
   */
  async verifyProvider(providerId, entered, deps = {}) {
    const provider = this.registry.providers[providerId];
    if (!provider) {
      throw new Error(`Cannot verify unknown provider "${providerId}".`);
    }
    const credential = this._credentialFor(provider, entered);
    const outcome = await verifyLiveAuth(provider.id, provider.authMethod, credential, deps);
    this.verificationResults[providerId] = outcome;
    return outcome;
  }

  /**
   * Non-interactive sweep used both by the TUI's save step and by tests: live-verify every
   * *enabled* provider (subscription_browser providers are skipped, not failed). Returns
   * per-provider outcomes plus whether every enabled, non-skipped provider passed.
   *
   * `credentials` maps providerId -> entered value (API key string, etc.) for providers
   * that need operator input; providers already verified via `verifyProvider` (e.g. during
   * the re-run "replace" flow) are not re-run.
   */
  async verifyAllEnabled({ credentials = {}, deps = {}, force = false } = {}) {
    const results = {};
    let allPassed = true;
    for (const provider of this.registry.listProviders({ enabledOnly: true })) {
      if (!force && this.verificationResults[provider.id]) {
        results[provider.id] = this.verificationResults[provider.id];
      } else {
        results[provider.id] = await this.verifyProvider(provider.id, credentials[provider.id], deps);
      }
      if (results[provider.id].result === VERIFY_RESULT.FAILED) {
        allPassed = false;
      }
    }
    return { results, allPassed };
  }

  /**
   * Re-run entry point (non-interactive core, TUI wraps it): summarise each currently
   * configured provider's saved enabled/disabled state so the operator can choose
   * skip vs replace per-provider instead of re-walking the whole registry.
   */
  reviewExisting() {
    return this.registry.listProviders().map(p => ({
      providerId: p.id,
      name: p.name,
      authMethod: p.authMethod,
      enabled: p.enabled,
      defaultModel: p.defaultModel,
      savedStatus: p.enabled ? 'enabled (not re-verified this run)' : 'disabled'
    }));
  }

  async run() {
    this.screen = blessed.screen({ smartCSR: true, title: 'DexCLI Setup' });

    const header = blessed.box({
      top: 0, width: '100%', height: 3, tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: ' {bold}DexCLI Setup{/bold} — space toggle, v verify, enter edit roles, q save & quit'
    });

    const providerList = blessed.list({
      top: 3, left: 0, width: '50%', height: '70%',
      label: ' Providers (space = enable/disable) ',
      border: { type: 'line' },
      style: { selected: { bg: 'blue' }, border: { fg: 'white' } },
      keys: true, vi: true, tags: true
    });

    const roleList = blessed.list({
      top: 3, left: '50%', width: '50%', height: '70%',
      label: ' Role mappings (enter = edit) ',
      border: { type: 'line' },
      style: { selected: { bg: 'blue' }, border: { fg: 'white' } },
      keys: true, vi: true, tags: true
    });

    const problemsBox = blessed.log({
      top: '73%', left: 0, width: '100%', height: '27%-3',
      label: ' Validation ',
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      tags: true
    });

    this.screen.append(header);
    this.screen.append(providerList);
    this.screen.append(roleList);
    this.screen.append(problemsBox);

    const verifyBadge = (providerId, authMethod) => {
      if (authMethod === AUTH_METHODS.SUBSCRIPTION_BROWSER) return '{grey-fg}[unverifiable]{/grey-fg}';
      const outcome = this.verificationResults[providerId];
      if (!outcome) return '{grey-fg}[unverified]{/grey-fg}';
      if (outcome.result === VERIFY_RESULT.VERIFIED) return '{green-fg}[live-verified]{/green-fg}';
      if (outcome.result === VERIFY_RESULT.SKIPPED) return '{grey-fg}[skipped]{/grey-fg}';
      return '{red-fg}[verify-failed]{/red-fg}';
    };

    const renderProviders = () => {
      const items = this.registry.listProviders().map(p =>
        `${p.enabled ? '{green-fg}[x]{/green-fg}' : '{red-fg}[ ]{/red-fg}'} ${p.name} (${p.authMethod}) ${verifyBadge(p.id, p.authMethod)}`
      );
      providerList.setItems(items);
    };

    const renderRoles = () => {
      const items = Object.keys(AGENT_ROLES).map(key => {
        const role = AGENT_ROLES[key];
        try {
          const cfg = this.registry.getRoleConfig(role);
          return `${role} → ${cfg.providerName} / ${cfg.modelId}`;
        } catch (err) {
          return `${role} → {red-fg}${err.message}{/red-fg}`;
        }
      });
      roleList.setItems(items);
    };

    const renderProblems = () => {
      const { valid, problems } = this.registry.validate();
      problemsBox.setContent('');
      if (valid) {
        problemsBox.log('{green-fg}All roles resolve to an enabled provider with a model.{/green-fg}');
      } else {
        problems.forEach(p => problemsBox.log(`{red-fg}✗{/red-fg} ${p}`));
      }
    };

    const renderAll = () => { renderProviders(); renderRoles(); renderProblems(); this.screen.render(); };

    providerList.key(['space'], () => {
      const idx = providerList.selected;
      const provider = this.registry.listProviders()[idx];
      if (provider) this.registry.setProviderEnabled(provider.id, !provider.enabled);
      renderAll();
    });

    providerList.key(['v'], () => {
      const idx = providerList.selected;
      const provider = this.registry.listProviders()[idx];
      if (provider) this._verifyProviderInteractive(provider, renderAll);
    });

    roleList.key(['enter'], () => {
      const idx = roleList.selected;
      const role = Object.values(AGENT_ROLES)[idx];
      this._editRoleMapping(role, renderAll);
    });

    providerList.focus();

    let saved = false;
    const quit = async () => {
      const { valid, problems } = this.registry.validate();
      if (!valid) {
        problemsBox.log('{red-fg}Not saved — unresolved problems above. Fix them or press Q again to abandon.{/red-fg}');
        this.screen.render();
        if (this._forceQuitArmed) {
          this.screen.destroy();
          return;
        }
        this._forceQuitArmed = true;
        return;
      }

      problemsBox.log('{yellow-fg}Live-verifying enabled providers before saving...{/yellow-fg}');
      this.screen.render();
      const { allPassed, results } = await this.verifyAllEnabled();
      Object.entries(results).forEach(([providerId, outcome]) => {
        const tag = outcome.result === VERIFY_RESULT.VERIFIED ? '{green-fg}✓{/green-fg}'
          : outcome.result === VERIFY_RESULT.SKIPPED ? '{grey-fg}—{/grey-fg}'
          : '{red-fg}✗{/red-fg}';
        problemsBox.log(`${tag} ${providerId}: ${outcome.reason}`);
      });
      renderProviders();

      if (!allPassed) {
        problemsBox.log('{red-fg}Not saved — one or more enabled providers failed live verification. Press Q again to save anyway.{/red-fg}');
        this.screen.render();
        if (this._forceQuitArmed) {
          const path = this.registry.save(this.configPath);
          saved = true;
          this.screen.destroy();
          console.log(`Saved provider config to ${path} (with unverified providers, forced).`);
          return;
        }
        this._forceQuitArmed = true;
        return;
      }

      const path = this.registry.save(this.configPath);
      saved = true;
      this.screen.destroy();
      console.log(`Saved provider config to ${path}`);
    };

    this.screen.key(['q', 'C-c'], () => { quit(); });
    renderAll();

    if (this.preExisting) {
      await this._reviewExistingFlow(renderAll);
    }

    return new Promise(resolve => {
      this.screen.on('destroy', () => resolve({ saved, registry: this.registry, verificationResults: this.verificationResults }));
    });
  }

  /**
   * Re-run flow: this.preExisting means providers.json already had entries when we loaded.
   * Rather than silently forcing a full re-walk, show each provider's saved status and let
   * the operator pick skip (leave as-is) or replace (re-verify live, and for api_key,
   * re-enter the key) per provider before the normal enable/role-mapping screen appears.
   */
  async _reviewExistingFlow(onDone) {
    const providers = this.registry.listProviders();
    for (const provider of providers) {
      await new Promise(resolve => {
        const box = blessed.list({
          top: 'center', left: 'center', width: '60%', height: 8,
          label: ` Existing config: ${provider.name} `,
          border: { type: 'line' },
          style: { selected: { bg: 'blue' }, border: { fg: 'magenta' } },
          keys: true, tags: true,
          items: [
            `Saved status: ${provider.enabled ? '{green-fg}enabled{/green-fg}' : '{red-fg}disabled{/red-fg}'} (${provider.authMethod})`,
            '{bold}[s]{/bold} skip — keep as saved, no re-verification',
            '{bold}[r]{/bold} replace — re-enter/re-verify this provider'
          ]
        });
        this.screen.append(box);
        box.focus();
        this.screen.render();

        const finish = async (replace) => {
          box.destroy();
          if (replace) {
            await this._verifyProviderInteractive(provider, () => {});
          }
          this.screen.render();
          resolve();
        };

        box.key(['s'], () => finish(false));
        box.key(['r'], () => finish(true));
        box.key(['escape'], () => finish(false));
      });
    }
    onDone();
  }

  /**
   * Interactive live-verify for one provider: prompts for an API key when the provider's
   * authMethod needs operator input, runs verifyProvider(), and reports the outcome.
   */
  async _verifyProviderInteractive(provider, onDone) {
    if (provider.authMethod === AUTH_METHODS.SUBSCRIPTION_BROWSER) {
      this.verificationResults[provider.id] = {
        result: VERIFY_RESULT.SKIPPED,
        reason: 'subscription_browser auth is intentionally unimplemented — live verification skipped.'
      };
      onDone();
      return;
    }

    let entered;
    if (provider.authMethod === AUTH_METHODS.API_KEY) {
      entered = await this._promptText(`Enter API key for ${provider.name}`);
      if (entered === null) { onDone(); return; } // cancelled
    }

    await this.verifyProvider(provider.id, entered);
    onDone();
  }

  /** Blocking blessed textbox prompt; resolves the entered string, or null if cancelled. */
  _promptText(label) {
    return new Promise(resolve => {
      const box = blessed.textbox({
        top: 'center', left: 'center', width: '60%', height: 3,
        label: ` ${label} (enter to submit, esc to cancel) `,
        border: { type: 'line' },
        style: { border: { fg: 'cyan' } },
        inputOnFocus: true,
        censor: true
      });
      this.screen.append(box);
      box.focus();
      this.screen.render();
      box.readInput((err, value) => {
        box.destroy();
        this.screen.render();
        resolve(err ? null : value);
      });
    });
  }

  _editRoleMapping(role, onDone) {
    const providers = this.registry.listProviders({ enabledOnly: true });
    if (providers.length === 0) {
      onDone();
      return;
    }
    const picker = blessed.list({
      top: 'center', left: 'center', width: '50%', height: providers.length + 4,
      label: ` Assign provider for "${role}" `,
      border: { type: 'line' },
      style: { selected: { bg: 'blue' }, border: { fg: 'magenta' } },
      keys: true, items: providers.map(p => `${p.name} (${p.defaultModel})`)
    });
    this.screen.append(picker);
    picker.focus();
    picker.key(['enter'], () => {
      const provider = providers[picker.selected];
      this.registry.setRoleMapping(role, provider.id, provider.defaultModel);
      picker.destroy();
      onDone();
    });
    picker.key(['escape', 'q'], () => {
      picker.destroy();
      onDone();
    });
    this.screen.render();
  }
}
