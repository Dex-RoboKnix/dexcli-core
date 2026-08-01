import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveWorkspacePath, WorkspaceEscapeError } from '../src/lib/WorkspaceGuard.js';

function testWorkspaceGuard() {
  console.log('--- WorkspaceGuard (T-08) Unit Tests ---');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-guard-'));
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nested', 'file.txt'), 'hello');

  // 1. Simple relative path inside root resolves fine.
  const ok = resolveWorkspacePath('nested/file.txt', { root });
  assert.strictEqual(ok, fs.realpathSync(path.join(root, 'nested', 'file.txt')));
  console.log('✅ in-root relative path resolves');

  // 2. `..` traversal that stays inside root is fine.
  const okDotDot = resolveWorkspacePath('nested/../nested/file.txt', { root });
  assert.strictEqual(okDotDot, fs.realpathSync(path.join(root, 'nested', 'file.txt')));
  console.log('✅ in-root ".." traversal resolves');

  // 3. `..` traversal that escapes root throws.
  assert.throws(
    () => resolveWorkspacePath('../outside.txt', { root }),
    WorkspaceEscapeError
  );
  console.log('✅ ".." escape denied');

  // 4. Absolute path outside root throws.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'dexcli-guard-elsewhere-'));
  assert.throws(
    () => resolveWorkspacePath(path.join(elsewhere, 'x.txt'), { root }),
    WorkspaceEscapeError
  );
  console.log('✅ absolute out-of-root path denied');

  // 5. Non-existent path inside root (about to be created) is fine.
  const future = resolveWorkspacePath('nested/new-file.txt', { root });
  assert.ok(future.startsWith(fs.realpathSync(root)));
  console.log('✅ non-existent in-root path resolves (create case)');

  // 6. Non-existent path that escapes via ".." still denied even though nothing exists yet.
  assert.throws(
    () => resolveWorkspacePath('../../nope.txt', { root }),
    WorkspaceEscapeError
  );
  console.log('✅ non-existent escaping path denied');

  // 7. Empty / non-string input throws.
  assert.throws(() => resolveWorkspacePath('', { root }), WorkspaceEscapeError);
  assert.throws(() => resolveWorkspacePath(undefined, { root }), WorkspaceEscapeError);
  console.log('✅ invalid input denied');

  // 8. Root itself resolves to root (no traversal at all).
  const rootResolved = resolveWorkspacePath('.', { root });
  assert.strictEqual(rootResolved, fs.realpathSync(root));
  console.log('✅ "." resolves to root itself');

  // 9. Symlink pointing outside root is denied (conservative symlink handling), when the
  // platform supports symlink creation without elevation.
  if (process.platform !== 'win32') {
    const linkPath = path.join(root, 'escape-link');
    fs.symlinkSync(elsewhere, linkPath);
    assert.throws(
      () => resolveWorkspacePath('escape-link/x.txt', { root }),
      WorkspaceEscapeError
    );
    console.log('✅ symlink escape denied');
  } else {
    console.log('⚠️ symlink escape test skipped on win32 (requires elevation to create symlinks)');
  }

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(elsewhere, { recursive: true, force: true });

  console.log('--- WorkspaceGuard Unit Tests Passed ---');
}

testWorkspaceGuard();
