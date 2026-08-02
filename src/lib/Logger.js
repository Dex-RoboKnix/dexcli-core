import fs from 'fs';
import path from 'path';
import os from 'os';

// Same dot-prefixed home-dir expansion used by ConfigLoader._resolveHome and
// SessionState._resolveHome/_resolveHomeStatic — no shared helper exists yet in this
// codebase (each module duplicates the one-liner), so we follow the existing convention
// rather than introduce a new cross-module dependency for a single regex.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * File logger for dexcli. Reads config.logging.logFile / config.logging.level
 * (see config/defaults.yaml) and appends timestamped, leveled lines to the log file.
 * Was previously a declared-but-dead config key: ConfigLoader carried the defaults but
 * nothing ever read config.logging or wrote to disk, so `~/.dexcli/dexcli.log` never
 * appeared no matter what happened at runtime. This is the first real consumer.
 */
export class Logger {
  constructor(config = {}) {
    const logging = config.logging || {};
    this.level = Object.prototype.hasOwnProperty.call(LEVELS, logging.level) ? logging.level : 'info';
    this.logFile = this._resolveHome(logging.logFile || '~/.dexcli/dexcli.log');
    this._dirEnsured = false;
    this._warnedFsError = false;
  }

  _resolveHome(p) {
    if (typeof p !== 'string') return p;
    return p.replace(/^~(?=$|\/|\\)/, os.homedir());
  }

  _ensureDir() {
    if (this._dirEnsured) return;
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this._dirEnsured = true;
  }

  _shouldLog(level) {
    return LEVELS[level] <= LEVELS[this.level];
  }

  _format(args) {
    return args
      .map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
        try {
          return JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      })
      .join(' ');
  }

  _write(level, args) {
    if (!this._shouldLog(level)) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${this._format(args)}\n`;
    try {
      this._ensureDir();
      fs.appendFileSync(this.logFile, line);
    } catch (e) {
      // Logging must never be the reason dexcli crashes. Warn once to stderr and drop
      // subsequent write failures silently rather than spamming stderr per log call.
      if (!this._warnedFsError) {
        this._warnedFsError = true;
        console.error(`[Logger] failed to write to ${this.logFile}: ${e.message}`);
      }
    }
  }

  error(...args) { this._write('error', args); }
  warn(...args) { this._write('warn', args); }
  info(...args) { this._write('info', args); }
  debug(...args) { this._write('debug', args); }
}

export default Logger;
