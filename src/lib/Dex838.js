/**
 * Dex838.js — Canonical DEX838 wire-protocol seam for dexcli.
 *
 * dexcli does NOT implement the DEX838 grammar. `packages/dexspine-core/src/dex838.js`
 * is the single source of truth for parse/format/qualifier extraction, per the ratified
 * decision in `_context-dump/_plan/DECISIONS.md` (Cluster F, 2026-07-29):
 *
 *   "gate on hardcode-qualifier detection using packages/dexspine-core's real DEX838
 *    parser (dex838.js) rather than reinventing qualifier detection"
 *
 * This module exists solely to isolate the cross-package import to ONE file. `dexspine/dexcli/core`
 * is its own git repo (Dex-RoboKnix/dexcli-core) and is slated for submodule conversion, at which
 * point the relative path below breaks. When dexspine-core is published as a package, change the
 * import on the next line and nothing else in dexcli needs to move.
 *
 * TODO(submodule): replace relative path with `@dexroboknix/dexspine-core` dependency.
 */

export {
  parseDEX838,
  formatDEX838,
  DEX838_REGEX,
  SOFTCODE_REGEX,
  HARDCODE_REGEX
} from '../../../../../packages/dexspine-core/src/dex838.js';
