export const mockProvider = {
  name: 'mock',
  getSpawnConfig(config) {
    return {
      executable: config.executable || 'echo',
      args: config.args || ['mock'],
      readyString: config.readyString || '>',
      readyTimeout: config.readyTimeout || 5000,
      responseTimeout: config.responseTimeout || 60000,
      ptyConfig: config.ptyConfig || { cols: 80, rows: 24 }
    };
  }
};
