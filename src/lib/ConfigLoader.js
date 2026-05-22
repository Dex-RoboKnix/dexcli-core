import fs from 'fs';
import path from 'path';
import os from 'os';

class ConfigLoader {
  constructor() {
    this.config = {
      gemini: {
        executable: process.platform === 'win32' ? 'gemini.cmd' : 'gemini',
        args: ['chat'],
        readyString: '>',
        readyTimeout: 5000,
        responseTimeout: 60000,
        stateful: true
      },
      pool: {
        initialSize: 2,
        maxSize: 5,
        scaleUpThreshold: 3,
        scaleDownAfter: 300,
        recycleAfterRequests: 100
      },
      tui: {
        geminiColor: 'blue',
        inputColor: 'green',
        statusColor: 'cyan'
      },
      session: {
        dir: '~/.dexcli/sessions',
        autoSaveInterval: 30000
      },
      logging: {
        level: 'info',
        logFile: '~/.dexcli/dexcli.log',
        keepRawAnsi: true
      }
    };
  }

  load(configPath) {
    if (!configPath) return this.config;
    
    const resolvedPath = this._resolveHome(configPath);
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          this._setByDotPath(key, this._parseValue(value));
        }
      });
    }
    return this.config;
  }

  get(dotPath) {
    return dotPath.split('.').reduce((obj, key) => obj && obj[key], this.config);
  }

  loadWithCLIOverrides(argv) {
    argv.forEach(arg => {
      if (arg.startsWith('--')) {
        const [fullKey, val] = arg.slice(2).split('=');
        if (val !== undefined) {
          this._setByDotPath(fullKey, this._parseValue(val));
        }
      }
    });
    return this.config;
  }

  _resolveHome(p) {
    if (typeof p !== 'string') return p;
    return p.replace(/^~(?=$|\/|\\)/, os.homedir());
  }

  _setByDotPath(dotPath, value) {
    const parts = dotPath.split('.');
    let current = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  _parseValue(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(val) && val !== '') return Number(val);
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      return val.slice(1, -1);
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      const items = val.slice(1, -1).split(',');
      return items.map(i => this._parseValue(i.trim()));
    }
    return val;
  }
}

const configLoader = new ConfigLoader();
export { ConfigLoader };
export default configLoader;
