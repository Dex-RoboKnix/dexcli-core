import { StreamCleaner, stripAnsi } from '../src/lib/StreamCleaner.js';
import configLoader, { ConfigLoader } from '../src/lib/ConfigLoader.js';
import { CliInstance } from '../src/lib/CliInstance.js';
import { CliPool } from '../src/lib/CliPool.js';
import { TaskDecomposer } from '../src/lib/TaskDecomposer.js';
import { ArtifactParser } from '../src/lib/ArtifactParser.js';
import { Orchestrator } from '../src/lib/Orchestrator.js';
import { SessionState } from '../src/lib/SessionState.js';

async function runCheck() {
  console.log('--- Phase 1 Module Check ---');

  const checks = [
    { name: 'StreamCleaner', test: () => typeof StreamCleaner === 'function' },
    { name: 'ConfigLoader', test: () => typeof ConfigLoader === 'function' },
    { name: 'CliInstance', test: () => typeof CliInstance === 'function' },
    { name: 'CliPool', test: () => typeof CliPool === 'function' },
    { name: 'TaskDecomposer', test: () => typeof TaskDecomposer === 'function' },
    { name: 'ArtifactParser', test: () => typeof ArtifactParser === 'function' },
    { name: 'Orchestrator', test: () => typeof Orchestrator === 'function' },
    { name: 'SessionState', test: () => typeof SessionState === 'function' },
  ];

  let allPass = true;
  for (const check of checks) {
    try {
      if (check.test()) {
        console.log(`✅ ${check.name} imported and constructor exists`);
      } else {
        console.log(`❌ ${check.name} check failed`);
        allPass = false;
      }
    } catch (e) {
      console.log(`❌ ${check.name} error: ${e.message}`);
      allPass = false;
    }
  }

  // Basic functionality checks
  const cleaner = new StreamCleaner();
  if (cleaner.strip('\u001b[32mhello\u001b[0m') === 'hello') {
    console.log('✅ StreamCleaner.strip works');
  } else {
    console.log('❌ StreamCleaner.strip failed');
    allPass = false;
  }

  const parser = new ArtifactParser();
  const sample = `\`\`\`js
console.log(1);
\`\`\``;
  const artifacts = parser.parse(sample);
  if (artifacts.length === 1 && artifacts[0].language === 'js') {
    console.log('✅ ArtifactParser.parse works');
  } else {
    console.log('❌ ArtifactParser.parse failed');
    allPass = false;
  }

  if (!allPass) process.exit(1);
  console.log('--- Phase 1 Check Passed ---');
}

runCheck();
