import configLoader from '../src/lib/ConfigLoader.js';
import os from 'os';

console.log(`Platform: ${os.platform()}`);
const config = configLoader.load();
console.log(`Default Executable: ${config.gemini.executable}`);

if (os.platform() === 'win32' && config.gemini.executable !== 'gemini.cmd') {
  console.error('❌ Failed: Expected gemini.cmd on Windows');
  process.exit(1);
} else {
  console.log('✅ Passed: ConfigLoader defaults correct');
}
