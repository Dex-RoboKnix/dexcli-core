import { EventEmitter } from 'events';
import { CliInstance } from './CliInstance.js';
import { execSync } from 'child_process';
import { NullApprovalQueue } from '../../../../../packages/dexcli-core/src/null-queue.js';
import { HARDCODE_REGEX } from '../../../../../packages/dexspine-core/src/dex838.js';
import { ProviderRegistry, AGENT_ROLES } from './ProviderRegistry.js';
import { strategyForProviderId } from '../providers/index.js';

export class CliPool extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.instances = [];
    this.taskQueue = [];
    this.healthCheckInterval = null;
    this.instanceCounter = 0;
    this.approvalQueue = new NullApprovalQueue();
    // ProviderRegistry.getRoleConfig() is the resolution layer for "which vendor and
    // model serves this role" — CliPool never reads a hardcoded 'gemini' config key
    // directly, it asks the registry, then maps the resolved provider to a spawn
    // strategy (F3). Callers may inject a pre-built registry (e.g. loaded from
    // ~/.dexcli/providers.json by the setup wizard); default is fresh-install defaults.
    this.registry = config.providerRegistry instanceof ProviderRegistry
      ? config.providerRegistry
      : ProviderRegistry.load();
  }

  /**
   * Resolve a role to a concrete per-instance spawn config: strategy name (which
   * providers/*.js module drives the PTY) plus the vendor-specific settings section
   * from defaults.yaml/ConfigLoader, overlaid with the registry's chosen model.
   */
  _resolveInstanceConfig(role = AGENT_ROLES.SUBAGENT_IMPLEMENTATION) {
    const roleConfig = this.registry.getRoleConfig(role);
    const strategy = strategyForProviderId(roleConfig.providerId);
    const base = this.config[strategy] || {};
    return { ...base, provider: strategy, modelId: roleConfig.modelId, role };
  }

  async initialize() {
    const initialSize = this.config.pool.initialSize || 2;
    const spawnPromises = [];

    for (let i = 0; i < initialSize; i++) {
      spawnPromises.push(this._spawnInstance());
    }

    await Promise.all(spawnPromises);
    this.startHealthCheck();
    return { ready: this.instances.length, failed: 0 };
  }

  async _spawnInstance(role = AGENT_ROLES.SUBAGENT_IMPLEMENTATION) {
    const instanceConfig = this._resolveInstanceConfig(role);
    const id = `${instanceConfig.provider}-${this.instanceCounter++}`;
    const instance = new CliInstance(id, instanceConfig);
    this.instances.push(instance);
    
    instance.on('exit', (info) => {
      this.emit('instance:crashed', { id, ...info });
    });

    try {
      await instance.start();
      this.emit('instance:ready', { id });
      return instance;
    } catch (err) {
      this.emit('instance:error', { id, error: err.message });
      throw err;
    }
  }

  getIdle() {
    return this.instances.find(i => i.isIdle() && !i.needsRecycle()) || null;
  }

  getStatus() {
    return {
      total: this.instances.length,
      idle: this.instances.filter(i => i.status === 'idle').length,
      busy: this.instances.filter(i => i.status === 'busy').length,
      failed: this.instances.filter(i => i.status === 'failed').length,
      killed: this.instances.filter(i => i.status === 'killed').length
    };
  }

  _hasHardcodeQualifier(prompt) {
    HARDCODE_REGEX.lastIndex = 0;
    return HARDCODE_REGEX.test(prompt);
  }

  async approveAndExecute(approvalId) {
    const card = this.approvalQueue.approve(approvalId, true);
    if (card.status !== 'approved_by_layer8') {
      throw new Error(`Approval ${approvalId} was not approved`);
    }
    return this.execute(card.subject.prompt, { ...card.subject.options, bypassApproval: true });
  }

  async execute(prompt, options = {}) {
    if (!options.bypassApproval && this._hasHardcodeQualifier(prompt)) {
      return this.approvalQueue.requestApproval({ subject: { prompt, options } });
    }

    const healthyInstances = this.instances.filter(i => i.status !== 'failed' && i.status !== 'killed');
    if (healthyInstances.length === 0) {
      throw new Error('All provider instances have failed. Check CLI installation and auth for the configured provider(s).');
    }

    let instance = this.getIdle();

    if (!instance) {
      const canScale = this.instances.length < (this.config.pool.maxSize || 5);
      if (canScale && this.taskQueue.length >= (this.config.pool.scaleUpThreshold || 3)) {
        instance = await this._spawnInstance();
      }
    }

    if (!instance) {
      return new Promise((resolve, reject) => {
        const task = { prompt, options, resolve, reject, timestamp: Date.now() };
        this.taskQueue.push(task);
        this._processQueue();
        
        setTimeout(() => {
          const index = this.taskQueue.indexOf(task);
          if (index !== -1) {
            this.taskQueue.splice(index, 1);
            reject(new Error('Task wait timeout'));
          }
        }, 30000);
      });
    }

    return this._runTask(instance, prompt, options);
  }

  async _runTask(instance, prompt, options) {
    if (options.role) {
      instance.assignRole(options.role);
    }

    try {
      const response = await instance.send(prompt);
      if (instance.needsRecycle()) {
        this.recycle(instance.id);
      }
      this._processQueue();
      return { instanceId: instance.id, response, role: instance.role };
    } catch (err) {
      this._processQueue();
      throw err;
    }
  }

  _processQueue() {
    if (this.taskQueue.length === 0) return;
    const instance = this.getIdle();
    if (instance) {
      const task = this.taskQueue.shift();
      this._runTask(instance, task.prompt, task.options)
        .then(task.resolve)
        .catch(task.reject);
    }
  }

  async recycle(instanceId) {
    const instance = this.instances.find(i => i.id === instanceId);
    if (instance) {
      await instance.recycle();
    }
  }

  startHealthCheck() {
    const intervalMs = 5000;
    this.healthCheckInterval = setInterval(() => {
      // Respawn unexpectedly killed instances if pool is degraded
      const healthyCount = this.instances.filter(i => i.status !== 'failed' && i.status !== 'killed').length;
      const initialSize = this.config.pool.initialSize || 2;
      
      if (healthyCount < initialSize) {
        this.emit('pool:degraded', { healthy: healthyCount, total: initialSize });
        this._spawnInstance().catch(() => {});
      }

      this.scaleDown();
    }, intervalMs);
  }

  scaleDown() {
    const idleInstances = this.instances.filter(i => i.isIdle());
    const initialSize = this.config.pool.initialSize || 2;
    if (idleInstances.length > initialSize) {
      // Kill one extra idle instance per health check
      const extra = idleInstances[0];
      extra.kill();
      this.instances = this.instances.filter(i => i.id !== extra.id);
    }
  }

  async shutdown() {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    const killPromises = this.instances.map(async i => {
      i.kill();
      return { id: i.id, status: 'killed' };
    });
    await Promise.all(killPromises);
    this.instances = [];
    return { cleanShutdown: true };
  }
}
