import configLoader from '../src/lib/ConfigLoader.js';
import os from 'os';

console.log(`Platform: ${os.platform()}`);
const config = configLoader.load();
console.log(`Default Executable: ${config.agy.executable}`);

if (config.agy.executable !== 'agy') {
  console.error('❌ Failed: Expected agy on Windows');
  process.exit(1);
} else {
  console.log('✅ Passed: ConfigLoader defaults correct');
}
