import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import pty from 'node-pty';
import { EventEmitter } from 'events';
import { StreamCleaner } from './StreamCleaner.js';
import { getProvider } from '../providers/index.js';
import { applyDexFilter } from './DexFilter.js';
import { checkProviderAuthStatus, AUTH_STATUS, resolveExecutable } from './ProviderAuthStatus.js';
import { Logger } from './Logger.js';

export class CliInstance extends EventEmitter {
  constructor(id, config, logger = null) {
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
    this.readyReject = null;
    this.readyTimeout = null;
    this.responseResolve = null;
    this.taskCount = 0;
    this.provider = getProvider(this.config.provider || 'agy');
    // CliPool normally injects its shared Logger (built from the full app config, which
    // includes config.logging); constructing one here from `config` (a per-instance
    // strategy config without a `logging` key) falls back to Logger's own defaults so a
    // directly-constructed CliInstance (as in test/unauthenticated-provider.test.js)
    // still logs somewhere sane instead of throwing.
    this.logger = logger || new Logger(config);
  }

  /**
   * Note (T029 / T030): Banner-text regex matching (_detectAuthError) is a fallback heuristic,
   * not the primary check. The primary check is pure-function credential/file inspection
   * (checkProviderAuthStatus) run prior to spawn. The secondary buffer scan is retained
   * because some auth errors (such as expired session tokens or server-side revokes) only
   * appear in the REPL output after spawn.
   */
  _detectAuthError(buffer) {
    const AUTH_ERROR_PATTERNS = [
      /Not logged in/i,
      /Please run \/login/i,
      /Please log in/i,
      /Please login/i,
      /Authentication required/i,
      /Auth required/i,
      /Unauthorized/i,
      /401 Unauthorized/i,
      /Invalid API key/i,
      /API key missing/i,
      /No API key/i,
      /API key not found/i,
      /Authentication error/i,
      /Auth failure/i,
      /Authentication failed/i,
      /How would you like to authenticate/i,
      /Sign in with Google/i,
      /Failed to sign in/i,
      /Do you want to continue\?/i,
      /Enter to select/i
    ];
    for (const pattern of AUTH_ERROR_PATTERNS) {
      const match = buffer.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  async start() {
    this.status = 'starting';
    let spawnConfig;
    try {
      spawnConfig = this.provider.getSpawnConfig(this.config);
    } catch (err) {
      this.status = 'failed';
      throw new Error(`Provider "${this.provider.name}" failed spawn config: ${err.message}`);
    }

    const providerId = this.config.provider || this.provider.name;
    const authResult = checkProviderAuthStatus(providerId, spawnConfig);

    if (authResult.status !== AUTH_STATUS.AUTHENTICATED) {
      this.status = 'failed';
      const exeStr = authResult.executable || spawnConfig.executable || 'none';
      throw new Error(
        `Provider "${this.provider.name}" (executable: ${exeStr}) is ${authResult.status}: ${authResult.reason}`
      );
    }

    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.readyTimeout = setTimeout(() => {
        if (this.status === 'starting') {
          this.status = 'failed';
          this.logger.error(`[CliInstance ${this.id}] ready timeout after ${spawnConfig.readyTimeout}ms (readyString=${JSON.stringify(spawnConfig.readyString)})`);
          this.readyResolve = null;
          this.readyReject = null;
          reject(new Error(`Ready timeout after ${spawnConfig.readyTimeout}ms`));
        }
      }, spawnConfig.readyTimeout);

      try {
        const executable = authResult.executable || resolveExecutable(spawnConfig.executable) || spawnConfig.executable;
        this.logger.debug(`[CliInstance ${this.id}] spawning PTY: ${executable} ${(spawnConfig.args || []).join(' ')}`);

        this.process = pty.spawn(executable, spawnConfig.args, {
          name: 'xterm-256color',
          cols: spawnConfig.ptyConfig?.cols || 80,
          rows: spawnConfig.ptyConfig?.rows || 24,
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
          this.logger.debug(`[CliInstance ${this.id}] PTY exited (code=${exitCode}, signal=${signal}, prevStatus=${prevStatus})`);
          this.emit('exit', { code: exitCode, signal });
          if (prevStatus === 'starting' && this.readyReject) {
            if (this.readyTimeout) clearTimeout(this.readyTimeout);
            this.status = 'failed';
            const authErr = this._detectAuthError(this.buffer);
            const errDetail = authErr
              ? `Provider "${this.provider.name}" (executable: ${spawnConfig.executable}) is unauthenticated or requires login: "${authErr}"`
              : `Provider process "${spawnConfig.executable}" exited during startup with exit code ${exitCode}. Output: ${this.buffer.trim() || 'none'}`;
            this.logger.error(`[CliInstance ${this.id}] failed to become ready: ${errDetail}`);
            const rejectFn = this.readyReject;
            this.readyResolve = null;
            this.readyReject = null;
            rejectFn(new Error(errDetail));
          } else if (prevStatus === 'busy' && this.responseResolve) {
            this.logger.error(`[CliInstance ${this.id}] crashed mid-task`);
            this.responseResolve.reject(new Error('Instance crashed mid-task'));
          }
        });
      } catch (err) {
        this.status = 'failed';
        if (this.readyTimeout) clearTimeout(this.readyTimeout);
        this.readyResolve = null;
        this.readyReject = null;
        reject(err);
      }
    });
  }

  _handleData(cleaned, raw) {
    this.emit('data', { id: this.id, chunk: cleaned, raw });

    const spawnConfig = this.provider.getSpawnConfig(this.config);
    const readyString = spawnConfig.readyString;
    
    // Robust prompt detection: check if buffer contains readyString followed by nothing but space/non-printables
    const escapedReady = readyString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const readyRegex = new RegExp(`(?:^|[\\r\\n]|[a-zA-Z0-9_-]+)${escapedReady}(?:[\\r\\n]|\\s|$)`);
    const isMatch = readyRegex.test(this.buffer.replace(/X/g, ' '));
    
    if (this.status === 'starting') {
      if (/Do you trust the contents of this project\?/i.test(this.buffer) && !this._sentTrustConfirm) {
        this._sentTrustConfirm = true;
        try {
          this.process.write('\r\n');
        } catch (e) {
          // ignore
        }
      }
      const authErr = this._detectAuthError(this.buffer);
      if (authErr && this.readyReject) {
        this.status = 'failed';
        if (this.readyTimeout) clearTimeout(this.readyTimeout);
        this.kill();
        const rejectFn = this.readyReject;
        this.readyResolve = null;
        this.readyReject = null;
        rejectFn(new Error(`Provider "${this.provider.name}" (executable: ${spawnConfig.executable}) is unauthenticated or requires login: "${authErr}"`));
        return;
      }
      if (isMatch) {
        this.status = 'idle';
        this.logger.debug(`[CliInstance ${this.id}] ready string detected, instance idle`);
        if (this.readyTimeout) clearTimeout(this.readyTimeout);
        this.emit('ready', { id: this.id });
        if (this.readyResolve) {
          const resolve = this.readyResolve;
          this.readyResolve = null;
          this.readyReject = null;
          resolve();
        }
      }
    } else if (this.status === 'busy' && isMatch) {
      this.status = 'idle';
      const lastPrompt = this.history[this.history.length - 1];
      let response = this.buffer.trim();
      
      const normalizedResponse = response.replace(/\r\n/g, '\n');
      const normalizedPrompt = lastPrompt ? lastPrompt.replace(/\r\n/g, '\n') : '';
      
      const echoIndex = normalizedPrompt ? normalizedResponse.indexOf(normalizedPrompt) : -1;
      if (echoIndex !== -1) {
        response = normalizedResponse.substring(echoIndex + normalizedPrompt.length).trim();
      } else {
        response = normalizedResponse;
      }
      
      const readyIndex = response.lastIndexOf(readyString);
      if (readyIndex !== -1) {
        response = response.substring(0, readyIndex).trim();
      }

      // F5: reduce raw PTY stdout before it ever reaches the orchestrator — ANSI/OSC
      // strip, redraw collapse, dedupe, head+tail truncation. Reduction stats go to the
      // debug log so a shrinking/growing signal is visible without re-reading raw output.
      const { text: filtered, stats } = applyDexFilter(response);
      response = filtered;
      if (this.config.debug) {
        console.debug(
          `[CliInstance ${this.id}] DEXFILTER: ${stats.rawLines} raw -> ${stats.keptLines} kept ` +
          `(dropped ${stats.droppedNoise} noise, collapsed ${stats.collapsed} repeats, truncated ${stats.truncated})`
        );
      }
      this.lastFilterStats = stats;

      this.emit('response', { id: this.id, response, filterStats: stats });
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
      const spawnConfig = this.provider.getSpawnConfig(this.config);
      const timeout = setTimeout(() => {
        if (this.status === 'busy') {
          this.status = 'idle'; // Recover to idle? Or failed? Spec says idle.
          this.logger.warn(`[CliInstance ${this.id}] response timeout after ${spawnConfig.responseTimeout}ms, recovering to idle`);
          this.emit('timeout', { id: this.id });
          if (this.responseResolve) {
            this.responseResolve = null;
            reject(new Error('Response timeout'));
          }
        }
      }, spawnConfig.responseTimeout);

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