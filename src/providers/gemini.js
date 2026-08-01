export const geminiProvider = {
  name: 'gemini',
  getSpawnConfig(config) {
    return {
      executable: config.executable || 'gemini',
      args: config.args || ['chat'],
      readyString: config.readyString || '>',
      readyTimeout: config.readyTimeout || 5000,
      responseTimeout: config.responseTimeout || 60000,
      ptyConfig: config.ptyConfig || { cols: 80, rows: 24 }
    };
  }
};
