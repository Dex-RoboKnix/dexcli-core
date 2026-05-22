import { spawnSync, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dexcliBin = path.join(__dirname, '..', 'bin', 'dexcli');
const mockGemini = path.join(__dirname, 'mocks', 'mock-gemini.js');

async function testIntegration() {
  console.log('--- Phase 3 Integration Check ---');

  const nodePath = process.execPath;
  const configPath = path.join(__dirname, 'test-config.yaml');
  const mockGeminiPath = mockGemini;
  
  // Create a config without quotes and with forward slashes for simplicity
  const config = `
gemini:
  executable: ${nodePath.replace(/\\/g, '/')}
  args: [${mockGeminiPath.replace(/\\/g, '/')}]
  readyString: >
pool:
  initialSize: 1
`;
  fs.writeFileSync(configPath, config);

  // Test Single-Shot Mode
  console.log('Testing Single-Shot Mode...');
  const singleShot = spawnSync('node', [dexcliBin, 'TestPrompt', '--config', configPath, '--verbose'], {
    encoding: 'utf8',
    timeout: 15000
  });
  
  if (singleShot.status === 0 && (singleShot.stdout.includes('Mock response') || singleShot.stdout.includes('TestPrompt'))) {
    console.log('✅ Single-Shot Mode works');
  } else {
    console.error('❌ Single-Shot Mode failed');
    console.error('STDOUT:', singleShot.stdout);
    console.error('STDERR:', singleShot.stderr);
  }

  // Test Piped Mode
  console.log('Testing Piped Mode...');
  const piped = spawnSync('node', [dexcliBin, '--no-tui', '--config', configPath], {
    input: 'PipedPrompt\n',
    encoding: 'utf8',
    timeout: 15000
  });

  if (piped.status === 0 && piped.stdout.includes('"taskCount":1')) {
    console.log('✅ Piped Mode works');
  } else {
    console.error('❌ Piped Mode failed');
    console.error('STDOUT:', piped.stdout);
  }

  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  console.log('--- Phase 3 Check Completed ---');
}

testIntegration();