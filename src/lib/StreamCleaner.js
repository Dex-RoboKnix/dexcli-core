export const stripAnsi = (str) => {
  if (typeof str !== 'string') return str;
  // CSI sequences: [ \u001b [ ... letter ]
  const csi = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  // OSC sequences: [ \u001b ] ... BEL or ESC \ ]
  const osc = /\u001b\].*?(?:\u0007|\u001b\\)/g;
  return str.replace(csi, '').replace(osc, '');
};

export class StreamCleaner {
  constructor(options = {}) {
    this.options = options;
    this.rawLog = [];
  }

  strip(str) {
    return stripAnsi(str);
  }

  clean(chunk) {
    const raw = chunk.toString();
    this.rawLog.push(raw);
    return this.strip(raw);
  }

  getRawLog() {
    return [...this.rawLog];
  }

  clearLog() {
    this.rawLog = [];
  }
}