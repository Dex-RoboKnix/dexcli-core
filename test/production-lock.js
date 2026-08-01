import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

async function productionLock() {
  console.log('--- FINAL PRODUCTION LOCK ---');

  const requiredFiles = [
    'package.json',
    'README.md',
    'LICENSE',
    '.gitignore',
    'bin/dexcli',
    'src/dexcli.js',
    'src/lib/CliInstance.js',
    'src/lib/CliPool.js',
    'src/lib/Orchestrator.js',
    'src/lib/TaskDecomposer.js',
    'src/lib/ArtifactParser.js',
    'src/lib/SessionState.js',
    'src/lib/ConfigLoader.js',
    'src/lib/StreamCleaner.js',
    'src/lib/TUI.js',
    'src/lib/ProviderRegistry.js',
    'src/lib/AgentsSpecResolver.js',
    'src/lib/Dex838.js',
    'src/lib/DexFilter.js',
    'src/lib/SetupWizard.js',
    'src/lib/AdeBridge.js',
    'config/defaults.yaml',
    'config/roles.yaml'
  ];

  let allExist = true;
  for (const f of requiredFiles) {
    if (fs.existsSync(path.join(rootDir, f))) {
      console.log(`✅ ${f} exists`);
    } else {
      console.error(`❌ ${f} is MISSING`);
      allExist = false;
    }
  }

  if (!allExist) {
    console.error('❌ PRODUCTION LOCK FAILED: Missing files');
    process.exit(1);
  }

  // Withdrawn modules. Re-adding these forks the DEX838 grammar away from its SSOT in
  // packages/dexspine-core — see _context-dump/_plan/DECISIONS.md, Cluster F (2026-07-29).
  const forbiddenFiles = {
    'src/lib/Dex838Machining.js':
      'forked the DEX838 grammar; use src/lib/Dex838.js (re-exports dexspine-core)',
    'src/lib/AnsiCleaner.js':
      'CJS module in an ESM package, superseded by StreamCleaner.js',
    'src/lib/InstancePool.js':
      'CJS require() in an ESM package (same defect class as AnsiCleaner.js) and written ' +
      'against a CliInstance API (waitForReady/isReady/getStatus) that no longer exists; ' +
      'superseded by CliPool.js, which the current CliInstance is built for. See F10.'
  };

  let noneForbidden = true;
  for (const [f, reason] of Object.entries(forbiddenFiles)) {
    if (fs.existsSync(path.join(rootDir, f))) {
      console.error(`❌ ${f} must not exist — ${reason}`);
      noneForbidden = false;
    }
  }

  if (!noneForbidden) {
    console.error('❌ PRODUCTION LOCK FAILED: Withdrawn modules present');
    process.exit(1);
  }

  console.log('\n✅ PRODUCTION LOCK: DexCLI v1.0.0 — All criteria passed.');
  console.log('System is ready for distribution.');
  process.exit(0);
}

productionLock();