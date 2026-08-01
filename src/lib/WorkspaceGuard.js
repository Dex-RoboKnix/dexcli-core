/**
 * WorkspaceGuard.js — filesystem path sandboxing guard for dexcli (T-08).
 *
 * MANDATORY ENTRY POINT: any current or future filesystem tool call in dexcli that accepts
 * a caller/agent-supplied path (read, write, list, delete, etc.) MUST resolve that path
 * through `resolveWorkspacePath()` before touching disk. As of this ticket no filesystem
 * tool surface exists yet (that's T-09) — this module is the foundation those tools are
 * required to build on. Do not add a new filesystem tool that bypasses this guard.
 *
 * Policy (deliberate, not negotiable by a caller): hard denial. A path that resolves
 * outside the workspace root throws. There is no interactive "allow once" prompt and no
 * read-only fallback — callers that need a broader root must construct a guard rooted
 * there explicitly (see `root` option), not bypass the check.
 */

import fs from 'fs';
import path from 'path';

export class WorkspaceEscapeError extends Error {
  constructor(message, { inputPath, resolvedPath, root } = {}) {
    super(message);
    this.name = 'WorkspaceEscapeError';
    this.inputPath = inputPath;
    this.resolvedPath = resolvedPath;
    this.root = root;
  }
}

/**
 * Resolve `root` to its real (symlink-free) absolute path, if it exists. Falls back to the
 * plain absolute path when the root itself doesn't exist yet (e.g. a cwd that was just
 * created) — nothing to conservatively resolve against.
 */
function realRoot(root) {
  const abs = path.resolve(root);
  try {
    return fs.realpathSync(abs);
  } catch (e) {
    return abs;
  }
}

/**
 * Resolve `inputPath` against a workspace root (default: process.cwd()) and guarantee the
 * result stays inside that root. Handles `..` traversal and resolves symlinks conservatively
 * — if the resolved *real* path (following symlinks) lands outside root, that's still denied
 * even if the pre-symlink path looked fine, since a symlink is exactly how a sandboxed path
 * escapes without an obvious `..` in the input string.
 *
 * @param {string} inputPath path supplied by a caller/agent — untrusted
 * @param {object} [options]
 * @param {string} [options.root] workspace root to sandbox against (default process.cwd())
 * @returns {string} absolute, resolved path guaranteed to be inside root
 * @throws {WorkspaceEscapeError} if inputPath resolves outside root
 */
export function resolveWorkspacePath(inputPath, options = {}) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    throw new WorkspaceEscapeError(
      `WorkspaceGuard: path must be a non-empty string, received ${JSON.stringify(inputPath)}`,
      { inputPath, resolvedPath: null, root: options.root }
    );
  }
  if (inputPath.includes('\0')) {
    throw new WorkspaceEscapeError(
      `WorkspaceGuard: path contains a NUL byte, refusing: ${JSON.stringify(inputPath)}`,
      { inputPath, resolvedPath: null, root: options.root }
    );
  }

  const root = realRoot(options.root || process.cwd());
  const resolved = path.resolve(root, inputPath);

  // Symlink-conservative check: resolve as much of the real path as actually exists on
  // disk (fs.realpathSync requires the full path to exist, but a filesystem tool may be
  // resolving a path for a file it's about to create). Walk up from the resolved path
  // until we find a segment that exists, realpath that, then re-append the remainder.
  let realResolved = resolved;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch (e) {
    // Path (or part of it) doesn't exist yet — walk up to the nearest existing ancestor,
    // realpath that, and reattach the non-existent tail so a symlinked existing parent
    // directory still gets caught.
    let dir = path.dirname(resolved);
    const tail = [path.basename(resolved)];
    while (true) {
      try {
        const realDir = fs.realpathSync(dir);
        realResolved = path.join(realDir, ...tail.reverse());
        break;
      } catch (e2) {
        const parent = path.dirname(dir);
        if (parent === dir) {
          // Nothing on the chain exists (root itself missing) — fall back to the plain
          // resolved path; the root-containment check below still applies.
          realResolved = resolved;
          break;
        }
        tail.push(path.basename(dir));
        dir = parent;
      }
    }
  }

  const relative = path.relative(root, realResolved);
  const escapes = relative === '' ? false : relative.startsWith('..') || path.isAbsolute(relative);

  if (escapes) {
    throw new WorkspaceEscapeError(
      `WorkspaceGuard: path "${inputPath}" resolves outside the workspace root "${root}" ` +
      `(resolved: "${realResolved}"). Denied.`,
      { inputPath, resolvedPath: realResolved, root }
    );
  }

  return realResolved === resolved ? resolved : realResolved;
}

export default resolveWorkspacePath;
