/**
 * SetupWizard.js — interactive `dexcli setup` provider/role wizard.
 *
 * Walks the operator through ProviderRegistry: toggle which providers are enabled,
 * assign a provider+model to each of the four agent roles, then validate() the whole
 * mapping and show every problem at once (never fail on the first one) before persisting
 * via ProviderRegistry.save(). Built on `blessed`, already a dependency (see TUI.js for
 * the same pattern in the main app).
 */

import blessed from 'blessed';
import { ProviderRegistry, AGENT_ROLES } from './ProviderRegistry.js';

export class SetupWizard {
  constructor({ configPath } = {}) {
    this.configPath = configPath;
    this.registry = ProviderRegistry.load(configPath);
    this.screen = null;
  }

  /** Non-interactive entry point used by tests / --check. Returns validate()'s result. */
  check() {
    return this.registry.validate();
  }

  async run() {
    this.screen = blessed.screen({ smartCSR: true, title: 'DexCLI Setup' });

    const header = blessed.box({
      top: 0, width: '100%', height: 3, tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: ' {bold}DexCLI Setup{/bold} — space to toggle a provider, enter to edit role mappings, q to save & quit'
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

    const renderProviders = () => {
      const items = this.registry.listProviders().map(p =>
        `${p.enabled ? '{green-fg}[x]{/green-fg}' : '{red-fg}[ ]{/red-fg}'} ${p.name} (${p.authMethod})`
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

    roleList.key(['enter'], () => {
      const idx = roleList.selected;
      const role = Object.values(AGENT_ROLES)[idx];
      this._editRoleMapping(role, renderAll);
    });

    providerList.focus();

    let saved = false;
    const quit = () => {
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
      const path = this.registry.save(this.configPath);
      saved = true;
      this.screen.destroy();
      console.log(`Saved provider config to ${path}`);
    };

    this.screen.key(['q', 'C-c'], quit);
    renderAll();

    return new Promise(resolve => {
      this.screen.on('destroy', () => resolve({ saved, registry: this.registry }));
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
