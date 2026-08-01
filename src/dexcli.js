import readline from 'readline';
import configLoader from './lib/ConfigLoader.js';
import { CliPool } from './lib/CliPool.js';
import { Orchestrator } from './lib/Orchestrator.js';
import { SessionState } from './lib/SessionState.js';
import { TUI } from './lib/TUI.js';
import { SetupWizard } from './lib/SetupWizard.js';
import { AdeBridge } from './lib/AdeBridge.js';

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'setup') {
    await runSetup(args.slice(1));
    return;
  }

  let configPath = undefined;
  const configIdx = args.findIndex(a => a === '--config');
  if (configIdx !== -1 && args[configIdx + 1]) {
    configPath = args[configIdx + 1];
  }
  
  const config = configLoader.load(configPath);
  configLoader.loadWithCLIOverrides(args);

  if (args.includes('--verbose')) {
    console.log('Loaded Config:', JSON.stringify(config, null, 2));
  }

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('DexCLI v1.0.0');
    return;
  }

  console.log('🚀 DexCLI v1.0.0 — Starting Gemini Swarm...');

  const pool = new CliPool(config);
  try {
    await pool.initialize();
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }

  const orchestrator = new Orchestrator(pool, config);

  // F7: broadcast this pool's PTY streams to the ADE runtime if one is listening.
  // Opt-out via config or --no-ade-bridge since most dexcli runs happen outside ADE
  // entirely; connection failures are swallowed to a warning, never fatal to the swarm.
  let adeBridge = null;
  if (config.ade?.bridge !== false && !args.includes('--no-ade-bridge')) {
    adeBridge = new AdeBridge(pool, {
      host: config.ade?.host,
      port: config.ade?.port,
      onError: (err) => {
        if (args.includes('--verbose')) console.warn(`[AdeBridge] ${err.message}`);
      }
    }).start();
  }

  // Handle session restoration
  let sessionId = undefined;
  const resumeIdx = args.findIndex(a => a === '--resume');
  if (resumeIdx !== -1 && args[resumeIdx + 1]) {
    sessionId = args[resumeIdx + 1];
  }
  const session = new SessionState(sessionId, config);
  
  if (sessionId) {
    const restored = await session.restore(pool);
    if (restored) console.log(`Restored session: ${sessionId}`);
  }

  // Parse positional prompt (skip values associated with flags)
  const skipNext = new Set();
  args.forEach((arg, idx) => {
    if (['--config', '--resume', '--instances', '--output'].includes(arg)) {
      skipNext.add(idx + 1);
    }
  });

  const positionalArgs = args.filter((arg, idx) => {
    return !arg.startsWith('-') && !skipNext.has(idx);
  });
  const prompt = positionalArgs.join(' ');

  if (prompt) {
    await singleShotMode(prompt, orchestrator, pool, session);
  } else if (!process.stdin.isTTY || args.includes('--no-tui')) {
    await pipedMode(orchestrator, pool, session);
  } else {
    const tui = new TUI({ pool, orchestrator, session, config });
    tui.start();
  }

  // Graceful shutdown on signals
  const shutdown = async () => {
    console.log('\nShutting down...');
    if (adeBridge) adeBridge.stop();
    await session.save({
      instances: pool.instances.map(i => i.toJSON()),
      executionLog: orchestrator.executionLog
    });
    await pool.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runSetup(args) {
  const configIdx = args.findIndex(a => a === '--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : undefined;

  if (args.includes('--check')) {
    // Non-interactive: print current validation state and exit. Used by CI/tests
    // and by operators who just want to know if setup is needed before launching a TUI.
    const wizard = new SetupWizard({ configPath });
    const { valid, problems } = wizard.check();
    if (valid) {
      console.log('✅ Provider setup is valid — all roles resolve to an enabled provider with a model.');
    } else {
      console.log('❌ Provider setup has problems:');
      problems.forEach(p => console.log(`  - ${p}`));
      process.exitCode = 1;
    }
    return;
  }

  const wizard = new SetupWizard({ configPath });
  const { saved } = await wizard.run();
  if (!saved) {
    console.log('Setup abandoned — no changes saved.');
  }
}

async function singleShotMode(prompt, orchestrator, pool, session) {
  try {
    console.log(`Executing: ${prompt}`);
    const result = await orchestrator.execute(prompt);
    
    console.log('\n--- Results ---');
    result.tasks.forEach(t => {
      if (t.error) {
        console.error(`Task Error: ${t.error}`);
      } else {
        console.log(t.response);
      }
    });

    if (result.artifacts.length > 0) {
      console.log('\n--- Artifacts ---');
      result.artifacts.forEach(a => console.log(`- ${a.filename} (${a.language})`));
    }

    await session.save({
      instances: pool.instances.map(i => i.toJSON()),
      artifacts: result.artifacts,
      executionLog: orchestrator.executionLog
    });
  } catch (err) {
    console.error(`\n❌ Execution failed: ${err.message}`);
  } finally {
    await pool.shutdown();
    process.exit(0);
  }
}

async function pipedMode(orchestrator, pool, session) {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  if (process.stdin.isTTY) {
    console.log('Piped mode active. Send prompts via stdin.');
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const result = await orchestrator.execute(line);
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error(JSON.stringify({ error: err.message }));
    }
  }

  await session.save({
    instances: pool.instances.map(i => i.toJSON()),
    executionLog: orchestrator.executionLog
  });
  await pool.shutdown();
  process.exit(0);
}

function printHelp() {
  console.log(`
Usage: dexcli [prompt] [options]
       dexcli setup [--check] [--config PATH]

Setup:
  setup              Interactive provider/role wizard (blessed TUI)
  setup --check      Print validation state and exit (non-interactive)

Options:
  --instances N      Number of Gemini instances (default from config)
  --resume ID        Resume previous session by ID
  --verbose          Enable verbose logging
  --output DIR       Output directory for artifacts
  --no-tui           Disable interactive TUI
  --config PATH      Path to custom YAML config
  --version, -v      Show version
  --help, -h         Show help
  
Commands (Interactive):
  /status            Show swarm status
  /artifacts         List collected artifacts
  /save              Save current session
  /clear             Clear output pane
  /quit              Graceful shutdown
  `);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});