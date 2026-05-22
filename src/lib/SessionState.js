import fs from 'fs';
import path from 'path';
import os from 'os';

export class SessionState {
  constructor(sessionId = Date.now().toString(), config) {
    this.sessionId = sessionId;
    this.config = config;
    const sessionDir = this._resolveHome(config.session?.dir || '~/.dexcli/sessions');
    this.stateFile = path.join(sessionDir, `${this.sessionId}.json`);
  }

  async save(state) {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      instances: state.instances || [],
      artifacts: state.artifacts || [],
      executionLog: state.executionLog || []
    };

    fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    return this.stateFile;
  }

  async load() {
    if (fs.existsSync(this.stateFile)) {
      const data = fs.readFileSync(this.stateFile, 'utf8');
      return JSON.parse(data);
    }
    return null;
  }

  async restore(pool) {
    const state = await this.load();
    if (!state) return false;

    // Spec says: for each saved instance with role, re-assign role to matching pool instance
    // This is more of a logical restore, as PTYs are gone.
    // We can't really restore the exact same PTY session unless we keep it alive.
    // But we can set roles in the new pool instances.
    if (state.instances) {
      state.instances.forEach((savedInst, idx) => {
        if (savedInst.role && pool.instances[idx]) {
          pool.instances[idx].assignRole(savedInst.role);
        }
      });
    }
    return true;
  }

  static async listAll(config) {
    const sessionDir = SessionState._resolveHomeStatic(config.session?.dir || '~/.dexcli/sessions');
    if (!fs.existsSync(sessionDir)) return [];

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const sessions = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, f), 'utf8'));
        return {
          id: data.sessionId,
          timestamp: data.timestamp,
          taskCount: data.executionLog?.length || 0,
          artifactCount: data.artifacts?.length || 0
        };
      } catch (e) {
        return null;
      }
    }).filter(s => s !== null);

    return sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  _resolveHome(p) {
    return p.replace(/^~(?=$|\/|\\)/, os.homedir());
  }

  static _resolveHomeStatic(p) {
    return p.replace(/^~(?=$|\/|\\)/, os.homedir());
  }
}
