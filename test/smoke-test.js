import { CliPool } from '../src/lib/CliPool.js';
import { Orchestrator } from '../src/lib/Orchestrator.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function smokeTest() {
  console.log('--- Smoke Test with Mock Gemini ---');

  const config = {
    gemini: {
      executable: 'C:\\nvm4w\\nodejs\\node.exe',
      args: [path.join(__dirname, 'mocks', 'mock-gemini.js')],
      readyString: '>',
      readyTimeout: 5000,
      responseTimeout: 10000
    },
    pool: {
      initialSize: 1,
      maxSize: 2
    }
  };

  const pool = new CliPool(config);
  try {
    await pool.initialize();
    console.log('✅ Pool initialized');

    const orchestrator = new Orchestrator(pool, config);
    const result = await orchestrator.execute('Hello mock');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.tasks[0].response.includes('Mock response')) {
      console.log('✅ Mock response received');
    } else {
      throw new Error('Unexpected mock response');
    }

    if (result.artifacts.length > 0) {
      console.log('✅ Artifact detected');
      if (result.artifacts[0].filename === 'mock-output.js') {
        console.log('✅ Filename inferred correctly');
      }
    } else {
      throw new Error('No artifacts found');
    }

    await pool.shutdown();
    console.log('✅ Pool shutdown');
    console.log('--- Smoke Test Passed ---');
  } catch (err) {
    console.error(`❌ Smoke test failed: ${err.message}`);
    process.exit(1);
  }
}

smokeTest();
