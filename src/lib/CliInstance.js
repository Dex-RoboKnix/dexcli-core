import pty from 'node-pty';
import { EventEmitter } from 'events';
import { StreamCleaner } from './StreamCleaner.js';

export class CliInstance extends EventEmitter {
  constructor(id, config) {
    super();
    this.id = id;
    this.config = config;
    this.status = 'created'; // created, starting, idle, busy, failed, killed
    this.role = null;
    this.history = [];
    this.cleaner = new StreamCleaner();
    this.buffer = '';
    this.process = null;
    this.readyResolve = null;
    this.responseResolve = null;
    this.taskCount = 0;
  }

  async start() {
    this.status = 'starting';
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      const timeout = setTimeout(() => {
        if (this.status === 'starting') {
          this.status = 'failed';
          reject(new Error(`Ready timeout after ${this.config.readyTimeout}ms`));
        }
      }, this.config.readyTimeout || 5000);

      try {
        this.process = pty.spawn(this.config.executable, this.config.args, {
          name: 'xterm-256color',
          cols: this.config.ptyConfig?.cols || 80,
          rows: this.config.ptyConfig?.rows || 24,
          cwd: process.cwd(),
          env: { ...process.env }
        });

        this.process.onData(data => {
          const cleaned = this.cleaner.clean(data);
          this.buffer += cleaned;
          this._handleData(cleaned, data);
        });

        this.process.onExit(({ exitCode, signal }) => {
          const prevStatus = this.status;
          this.status = 'killed';
          this.emit('exit', { code: exitCode, signal });
          if (prevStatus === 'busy' && this.responseResolve) {
            this.responseResolve.reject(new Error('Instance crashed mid-task'));
          }
        });
      } catch (err) {
        this.status = 'failed';
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  _handleData(cleaned, raw) {
    this.emit('data', { id: this.id, chunk: cleaned, raw });

    const readyString = this.config.readyString || '>';
    
    // Robust prompt detection: check if buffer contains readyString followed by nothing but space/non-printables
    const escapedReady = readyString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const readyRegex = new RegExp(`${escapedReady}[\\s\\x00-\\x1F]*$`);
    const isMatch = readyRegex.test(this.buffer.replace(/X/g, ' '));
    
    if (this.status === 'starting' && isMatch) {
      this.status = 'idle';
      this.emit('ready', { id: this.id });
      if (this.readyResolve) {
        const resolve = this.readyResolve;
        this.readyResolve = null;
        resolve();
      }
    } else if (this.status === 'busy' && isMatch) {
      this.status = 'idle';
      const lastPrompt = this.history[this.history.length - 1];
      let response = this.buffer.trim();
      
      const echoIndex = response.indexOf(lastPrompt);
      if (echoIndex !== -1) {
        response = response.substring(echoIndex + lastPrompt.length).trim();
      }
      
      const readyIndex = response.lastIndexOf(readyString);
      if (readyIndex !== -1) {
        response = response.substring(0, readyIndex).trim();
      }

      this.emit('response', { id: this.id, response });
      if (this.responseResolve) {
        const { resolve, timeout } = this.responseResolve;
        clearTimeout(timeout);
        this.responseResolve = null;
        resolve(response);
      }
    }
  }

  async send(prompt) {
    if (this.status !== 'idle') {
      throw new Error(`Instance ${this.id} is not idle (status: ${this.status})`);
    }

    this.status = 'busy';
    this.buffer = '';
    this.history.push(prompt);
    if (this.history.length > 50) this.history.shift();
    this.taskCount++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.status === 'busy') {
          this.status = 'idle'; // Recover to idle? Or failed? Spec says idle.
          this.emit('timeout', { id: this.id });
          if (this.responseResolve) {
            this.responseResolve = null;
            reject(new Error('Response timeout'));
          }
        }
      }, this.config.responseTimeout || 60000);

      this.responseResolve = { resolve, reject, timeout };
      this.process.write(prompt + '\r\n');
    });
  }

  assignRole(role) {
    this.role = role;
    // Spec says: sends role instruction to pty as context-setting message
    // We'll just set it for now, T026 defines roles.yaml with prompt_prefixes.
    // The actual sending might happen in Orchestrator or here.
    // T009 says "Add logic to send role-setting prompt to PTY" in old manifest.
    // New T010 says "assignRole(role) — sets this.role, sends role instruction to pty as context-setting message"
  }

  async recycle() {
    this.kill();
    this.status = 'starting';
    this.buffer = '';
    this.taskCount = 0;
    await this.start();
    this.emit('recycled', { id: this.id });
  }

  kill() {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {
        // ignore
      }
    }
    this.status = 'killed';
  }

  isIdle() {
    return this.status === 'idle';
  }

  isFailed() {
    return this.status === 'failed';
  }

  needsRecycle() {
    return this.taskCount >= (this.config.recycleAfterRequests || 100);
  }

  toJSON() {
    return {
      id: this.id,
      status: this.status,
      role: this.role,
      taskCount: this.taskCount,
      historyLength: this.history.length
    };
  }
}