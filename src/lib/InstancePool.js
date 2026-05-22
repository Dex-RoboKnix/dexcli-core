// src/lib/InstancePool.js
const CliInstance = require('./CliInstance');

class InstancePool {
  constructor(maxInstances = 5, shell = 'powershell.exe', requestDelay = 200) { // Default delay of 200ms
    this.maxInstances = maxInstances;
    this.shell = shell;
    this.requestDelay = requestDelay; // Delay in ms between requests
    this.instances = []; // Array to hold CliInstance objects
    this.instanceCounter = 0; // To assign unique IDs to instances
    this.initialized = false;
    this.healthCheckInterval = null;
    this.HEALTH_CHECK_INTERVAL_MS = 10000; // Check health every 10 seconds

    this.requestQueue = []; // Queue for requests when no idle instance is available
    this.isProcessingQueue = false; // Flag to manage queue processing

    this.status = {
      poolSize: 0,
      availableInstances: 0,
      totalInstances: 0,
      activeTasks: 0,
      errorInstances: 0,
    };
  }

  /**
   * Initializes the instance pool by spawning the initial set of CLI instances.
   * @param {number} initialInstances - The number of instances to spawn initially.
   * @returns {Promise<void>} A promise that resolves when all initial instances are ready.
   */
  async initialize(initialInstances = 2) {
    console.log(`[InstancePool] Initializing with ${initialInstances} instances (max ${this.maxInstances})...`);
    this.status.totalInstances = initialInstances;
    this.status.availableInstances = initialInstances;

    const instancePromises = [];
    for (let i = 0; i < initialInstances; i++) {
      this.instanceCounter++;
      const instance = new CliInstance(this.instanceCounter, this.shell);
      this.instances.push(instance);
      instancePromises.push(instance.waitForReady()); // Wait for each instance to be ready
    }

    try {
      await Promise.all(instancePromises);
      console.log('[InstancePool] All initial instances are ready.');
      this.initialized = true;
      this.startHealthCheck(); // Start health checks after initialization
    } catch (error) {
      console.error('[InstancePool] Failed to initialize all instances:', error);
      this.initialized = false;
      // Depending on requirements, may need to retry or halt execution
      throw error; // Rethrow to indicate initialization failure
    }
  }

  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.healthCheckInterval = setInterval(() => {
      console.log('[InstancePool] Running health check...');
      this.instances.forEach(instance => {
        if (instance.getStatus().state === 'error' || instance.getStatus().state === 'stopped') {
          console.warn(`[InstancePool] Instance ${instance.id} is in state ${instance.getStatus().state}. Attempting to respawn.`);
          this.respawnInstance(instance);
        }
      });
      this.updatePoolStatus(); // Update status after potential respawns
    }, this.HEALTH_CHECK_INTERVAL_MS);
    console.log(`[InstancePool] Health check started (interval: ${this.HEALTH_CHECK_INTERVAL_MS}ms).`);
  }

  async respawnInstance(instance) {
    const index = this.instances.indexOf(instance);
    if (index === -1) return;

    console.log(`[InstancePool] Respawning instance ${instance.id}...`);
    instance.kill(true); // Force kill if still running

    const newInstanceId = ++this.instanceCounter; // Assign a new ID or reuse? Manifest implies sequential
    const newInstance = new CliInstance(newInstanceId, this.shell);
    this.instances[index] = newInstance; // Replace old instance

    try {
      await newInstance.waitForReady();
      console.log(`[InstancePool] Instance ${newInstanceId} respawned and ready.`);
      this.status.errorInstances = this.instances.filter(inst => inst.getStatus().state === 'error').length; // Update error count
      this.updatePoolStatus(); // Update pool status
    } catch (error) {
      console.error(`[InstancePool] Failed to respawn instance ${newInstanceId}:`, error);
      // If respawn fails, it might remain in an error state.
      // Could implement retry logic here.
    }
  }

  /**
   * Finds and returns an idle CliInstance.
   * An idle instance is one that is ready and not currently processing a command.
   * @returns {CliInstance | null} The idle instance, or null if none are available.
   */
  getIdle() {
    const idleInstance = this.instances.find(instance =>
      instance.isReady && !instance.isProcessingCommand && instance.getStatus().state === 'running'
    );
    return idleInstance || null;
  }

  /**
   * Waits for an idle instance to become available.
   * If no idle instance is found, it queues the request and polls until one is available or the max queue wait time is reached.
   * @param {number} maxQueueWaitTime - Maximum time to wait for an idle instance (in ms).
   * @returns {Promise<CliInstance>} A promise that resolves with an idle CliInstance.
   */
  waitForIdle(maxQueueWaitTime = 30000) { // 30 seconds default max wait
    return new Promise((resolve, reject) => {
      const checkInterval = 200; // ms
      let elapsed = 0;

      const findIdle = () => {
        const idleInstance = this.getIdle();
        if (idleInstance) {
          console.log(`[InstancePool] Found idle instance ${idleInstance.id}.`);
          this.status.availableInstances--; // Decrement available count as it's now being used
          return resolve(idleInstance);
        }

        elapsed += checkInterval;
        if (elapsed >= maxQueueWaitTime) {
          const errorMsg = `[InstancePool] Timeout waiting for an idle instance after ${maxQueueWaitTime}ms.`;
          console.error(errorMsg);
          return reject(new Error(errorMsg));
        }

        // If no idle instance found, continue polling
        setTimeout(findIdle, checkInterval);
      };

      // Start the polling process
      findIdle();
    });
  }

  /**
   * Scales up the number of instances in the pool, up to the maximum allowed.
   * @param {number} count - The number of instances to add.
   * @returns {Promise<void>} A promise that resolves when scaling is complete.
   */
  async scaleUp(count = 1) {
    const currentInstances = this.instances.length;
    const instancesToAdd = Math.min(count, this.maxInstances - currentInstances);

    if (instancesToAdd <= 0) {
      console.log(`[InstancePool] Cannot scale up: Already at max instances (${this.maxInstances}) or no instances requested.`);
      return;
    }

    console.log(`[InstancePool] Scaling up by ${instancesToAdd} instances. Current: ${currentInstances}, Max: ${this.maxInstances}.`);

    const instancePromises = [];
    for (let i = 0; i < instancesToAdd; i++) {
      this.instanceCounter++;
      const newInstance = new CliInstance(this.instanceCounter, this.shell);
      this.instances.push(newInstance);
      instancePromises.push(newInstance.waitForReady());
    }

    try {
      await Promise.all(instancePromises);
      console.log(`[InstancePool] Successfully scaled up by ${instancesToAdd} instances. Total: ${this.instances.length}.`);
      this.updatePoolStatus(); // Update pool status after scaling
    } catch (error) {
      console.error(`[InstancePool] Failed to scale up instances:`, error);
      // Handle scaling failure - perhaps remove partially added instances or retry.
      // For now, log the error.
      throw error;
    }
  }

  /**
   * Sends a task to an available instance, waiting if necessary.
   * Handles instance recycling and error states.
   * @param {string} taskCommand - The command to execute for the task.
   * @param {object} options - Optional parameters for the task.
   * @returns {Promise<string>} A promise that resolves with the output of the task.
   */
  async sendTask(taskCommand, options = {}) {
    if (!this.initialized) {
      throw new Error('[InstancePool] Pool not initialized. Call initialize() first.');
    }

    console.log(`[InstancePool] Received task: "${taskCommand}"`);
    this.status.activeTasks++;
    this.updatePoolStatus();

    let instance;
    try {
      // Attempt to get an idle instance immediately
      instance = this.getIdle();

      if (!instance) {
        // If no idle instance, wait for one to become available
        console.log('[InstancePool] No idle instances available. Waiting for one...');
        instance = await this.waitForIdle(options.maxWaitTime);
      }

      // If an instance was found (either immediately or after waiting)
      if (instance) {
        // Apply request delay before sending the command to avoid throttling
        if (this.requestDelay > 0) {
          console.log(`[InstancePool] Waiting ${this.requestDelay}ms before sending task due to rate limiting.`);
          await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }

        console.log(`[InstancePool] Routing task to instance ${instance.id}.`);
        const output = await instance.send(taskCommand);
        // After task completion, the instance should be idle again or available.
        // The instance's internal state (`isProcessingCommand` set to false by `send` method)
        // and `waitForIdle` will reflect this.

        // Handle recycling: If an instance is in an error state or has been running for too long,
        // we might want to respawn it. For now, we'll rely on health checks for respawning.
        // A more aggressive approach could be to respawn after a certain number of tasks.
        // For now, simply update status.

        console.log(`[InstancePool] Task "${taskCommand}" completed on instance ${instance.id}.`);
        this.status.activeTasks--;
        this.updatePoolStatus();
        return output;
      } else {
        // This case should ideally not be reached if waitForIdle throws on timeout
        throw new Error('[InstancePool] Failed to acquire an instance after waiting.');
      }
    } catch (error) {
      console.error(`[InstancePool] Error sending task "${taskCommand}":`, error);
      this.status.activeTasks--; // Decrement active tasks even on error
      this.updatePoolStatus();
      throw error; // Re-throw the error
    }
  }

  /**
   * Shuts down all managed PTY instances gracefully.
   * @returns {Promise<void>} A promise that resolves when all instances have been shut down.
   */
  async shutdown() {
    console.log('[InstancePool] Shutting down all instances...');
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const shutdownPromises = this.instances.map(instance => {
      console.log(`[InstancePool] Shutting down instance ${instance.id}.`);
      return instance.kill(false); // Use graceful shutdown
    });

    try {
      await Promise.all(shutdownPromises);
      console.log('[InstancePool] All instances shut down successfully.');
      this.instances = []; // Clear the instances array
      this.instanceCounter = 0; // Reset counter
      this.initialized = false;
      this.status = { // Reset status
        poolSize: 0,
        availableInstances: 0,
        totalInstances: 0,
        activeTasks: 0,
        errorInstances: 0,
      };
    } catch (error) {
      console.error('[InstancePool] Error during shutdown:', error);
      // Log the error, but proceed with clearing state as much as possible
      this.instances = [];
      this.instanceCounter = 0;
      this.initialized = false;
      this.status = {
        poolSize: 0,
        availableInstances: 0,
        totalInstances: 0,
        activeTasks: 0,
        errorInstances: 0,
      };
      throw error; // Re-throw if necessary
    }
  }

  updatePoolStatus() {
    this.status.totalInstances = this.instances.length;
    this.status.availableInstances = this.instances.filter(inst => inst.isReady && !inst.isProcessingCommand).length;
    this.status.errorInstances = this.instances.filter(inst => inst.getStatus().state === 'error').length;
    // activeTasks is more dynamic, updated by sendTask
  }

  getStatus() {
    this.updatePoolStatus(); // Ensure status is up-to-date
    return this.status;
  }
}

module.exports = InstancePool;
