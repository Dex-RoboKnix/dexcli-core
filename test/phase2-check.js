import { TUI } from '../src/lib/TUI.js';
import { EventEmitter } from 'events';

async function testTUI() {
  console.log('--- Phase 2 TUI Check ---');

  const mockPool = new EventEmitter();
  mockPool.instances = [
    { id: 'gemini-0', status: 'idle', toJSON: () => ({ id: 'gemini-0', status: 'idle' }) },
    { id: 'gemini-1', status: 'busy', toJSON: () => ({ id: 'gemini-1', status: 'busy' }) }
  ];
  mockPool.getStatus = () => ({ total: 2, idle: 1, busy: 1 });
  mockPool.taskQueue = [];
  mockPool.shutdown = async () => {};

  const mockOrchestrator = {
    execute: async () => ({
      taskCount: 1,
      artifactCount: 1,
      executionTime: 100,
      artifacts: [{ filename: 'test.js', language: 'javascript' }],
      tasks: [{ response: 'mock response', instanceId: 'gemini-0', role: 'general' }]
    }),
    executionLog: []
  };

  const mockSession = {
    save: async () => 'mock/path.json'
  };

  const config = {
    tui: {
      statusColor: 'cyan',
      geminiColor: 'blue',
      inputColor: 'green'
    },
    session: { dir: '~/.dexcli/sessions' }
  };

  try {
    const tui = new TUI({
      pool: mockPool,
      orchestrator: mockOrchestrator,
      session: mockSession,
      config
    });

    console.log('✅ TUI instantiated');
    
    // Test event handling
    mockPool.emit('instance:data', { id: 'gemini-0', chunk: 'Hello World' });
    console.log('✅ Pool event emitted');

    // Shutdown after 1 second
    setTimeout(() => {
      tui.screen.destroy();
      console.log('✅ TUI screen destroyed');
      console.log('--- Phase 2 Check Passed ---');
      process.exit(0);
    }, 1000);

  } catch (err) {
    console.error(`❌ TUI check failed: ${err.message}`);
    process.exit(1);
  }
}

testTUI();
