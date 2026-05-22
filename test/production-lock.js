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

  console.log('\n✅ PRODUCTION LOCK: DexCLI v1.0.0 — All criteria passed.');
  console.log('System is ready for distribution.');
  process.exit(0);
}

productionLock();