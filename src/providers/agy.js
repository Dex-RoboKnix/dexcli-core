export const agyProvider = {
  name: 'agy',
  getSpawnConfig(config) {
    return {
      executable: config.executable || 'agy',
      args: config.args !== undefined ? config.args : ['--dangerously-skip-permissions'],
      readyString: config.readyString || '>',
      readyTimeout: config.readyTimeout || 5000,
      responseTimeout: config.responseTimeout || 60000,
      ptyConfig: config.ptyConfig || { cols: 80, rows: 24 }
    };
  }
};
