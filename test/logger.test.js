import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from '../src/lib/Logger.js';

function readLines(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
}

function testLogger() {
  console.log('--- Logger Unit Tests ---');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-logger-'));
  const logFile = path.join(dir, 'nested', 'dexcli.log');

  // 1. Creates the parent directory on first write, not at construction time.
  const logger = new Logger({ logging: { level: 'info', logFile } });
  assert.ok(!fs.existsSync(path.dirname(logFile)), 'parent dir should not exist before first write');
  logger.info('hello world');
  assert.ok(fs.existsSync(logFile), 'log file should exist after first write');
  console.log('✅ creates parent dir + file lazily on first write');

  // 2. Appends timestamped, leveled lines.
  const lines = readLines(logFile);
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[INFO\] hello world$/);
  console.log('✅ writes ISO-timestamped, leveled line');

  // 3. Append behavior: subsequent calls add lines, don't overwrite.
  logger.info('second line');
  assert.strictEqual(readLines(logFile).length, 2);
  console.log('✅ appends rather than overwrites');

  // 4. Level filtering: default 'info' level drops 'debug' calls.
  logger.debug('should be dropped');
  assert.strictEqual(readLines(logFile).length, 2, 'debug should be filtered out at info level');
  console.log('✅ filters out debug when level=info');

  // 5. warn/error always logged at info level (higher severity than info).
  logger.warn('a warning');
  logger.error('an error');
  assert.strictEqual(readLines(logFile).length, 4);
  console.log('✅ warn/error pass through at info level');

  // 6. debug level config allows debug lines through.
  const debugLogFile = path.join(dir, 'debug.log');
  const debugLogger = new Logger({ logging: { level: 'debug', logFile: debugLogFile } });
  debugLogger.debug('visible now');
  assert.strictEqual(readLines(debugLogFile).length, 1);
  console.log('✅ debug level config allows debug lines through');

  // 7. error-level config drops info/warn/debug.
  const errorLogFile = path.join(dir, 'error.log');
  const errorLogger = new Logger({ logging: { level: 'error', logFile: errorLogFile } });
  errorLogger.info('dropped');
  errorLogger.warn('dropped');
  errorLogger.debug('dropped');
  assert.ok(!fs.existsSync(errorLogFile), 'no file should be created if nothing passes the level filter');
  errorLogger.error('kept');
  assert.strictEqual(readLines(errorLogFile).length, 1);
  console.log('✅ error level config drops lower-severity levels');

  // 8. Unknown/missing level config falls back to 'info' default.
  const fallbackLogFile = path.join(dir, 'fallback.log');
  const fallbackLogger = new Logger({ logging: { level: 'not-a-real-level', logFile: fallbackLogFile } });
  assert.strictEqual(fallbackLogger.level, 'info');
  console.log('✅ unknown level config falls back to info');

  // 9. Missing config entirely still works with the documented default path shape.
  const bareLogger = new Logger();
  assert.ok(bareLogger.logFile.endsWith(path.join('.dexcli', 'dexcli.log')));
  console.log('✅ Logger() with no config uses documented default logFile path');

  // 10. ~ expansion resolves to the real home dir (same behavior as ConfigLoader/SessionState).
  assert.ok(!bareLogger.logFile.startsWith('~'));
  assert.ok(bareLogger.logFile.startsWith(os.homedir()));
  console.log('✅ ~ expands to os.homedir()');

  // 11. Object/Error args are serialized rather than producing "[object Object]".
  const objLogFile = path.join(dir, 'obj.log');
  const objLogger = new Logger({ logging: { level: 'info', logFile: objLogFile } });
  objLogger.info('payload', { a: 1, b: 'two' });
  const objLine = readLines(objLogFile)[0];
  assert.ok(objLine.includes('{"a":1,"b":"two"}'), `expected serialized object in: ${objLine}`);
  console.log('✅ object args are JSON-serialized');

  console.log('--- Logger: All tests passed ---');
}

testLogger();
