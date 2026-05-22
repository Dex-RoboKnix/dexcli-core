import pty from 'node-pty';
import os from 'os';

const executable = 'gemini.cmd';

console.log(`Attempting to spawn: ${executable} --version`);

try {
  const proc = pty.spawn(executable, ['--version'], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env
  });

  let output = '';
  proc.on('data', (data) => {
    output += data;
  });

  proc.on('exit', (code) => {
    console.log(`Exited with code: ${code}`);
    console.log('Output:', output.trim());
    if (code === 0) {
      console.log('✅ Spawn successful');
    } else {
      console.log('❌ Spawn failed (non-zero exit)');
    }
  });
} catch (e) {
  console.error('❌ Spawn threw error:', e.message);
}