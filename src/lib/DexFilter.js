/**
 * DexFilter.js — DEXFILTER output-reduction pipeline for dexcli.
 *
 * Raw PTY output from L2 sub-agents (Gemini/Claude worker REPLs) is noisy: ANSI colour,
 * spinner carriage-returns, repeated prompts, thousands of lines of scrollback. Feeding
 * that straight back to the L1 Orchestrator burns its context window for no gain.
 * DEXFILTER reduces a raw stream to the smallest text that preserves meaning.
 *
 * Scope note: this module deliberately does NOT parse or format DEX838 — that lives in
 * `Dex838.js`, which re-exports the canonical implementation from dexspine-core.
 * Replaces the withdrawn `Dex838Machining.js`, which forked the wire grammar.
 */

import { stripAnsi } from './StreamCleaner.js';
import { parseDEX838, HARDCODE_REGEX } from './Dex838.js';

/** Lines that carry no information for the orchestrator. */
const NOISE_PATTERNS = [
  /^\s*$/,                                  // blank
  /^[\s⠀-⣿|/\-\\.oO*]+$/,         // spinner / braille / ascii-progress frames
  /^\s*\d+%\s*(\|.*)?$/,                    // bare percentage progress
  /^\s*(>|\$|#)\s*$/                        // bare prompt echo
];

export const DEFAULT_FILTER_OPTIONS = {
  maxLines: 200,
  collapseRepeats: true,
  dropNoise: true
};

/**
 * Reduce a raw TTY stream to orchestrator-ready text.
 *
 * @param {string} rawOutput
 * @param {object} [options] see DEFAULT_FILTER_OPTIONS
 * @returns {{ text: string, stats: { rawLines: number, keptLines: number, droppedNoise: number, collapsed: number, truncated: number } }}
 */
export function applyDexFilter(rawOutput, options = {}) {
  const opts = { ...DEFAULT_FILTER_OPTIONS, ...options };

  if (typeof rawOutput !== 'string') {
    throw new TypeError(`applyDexFilter expects a string, received ${typeof rawOutput}`);
  }

  // Carriage returns are in-place redraws, not line breaks: keep only the final frame
  // of each redraw group rather than every intermediate spinner state.
  const cleanRaw = stripAnsi(rawOutput).replace(/\r\n/g, '\n');
  const normalised = cleanRaw
    .split('\n')
    .map(line => {
      const frames = line.split('\r');
      return frames[frames.length - 1];
    });

  const rawLines = normalised.length;
  let droppedNoise = 0;
  let collapsed = 0;

  const kept = [];
  let previous = null;

  for (const line of normalised) {
    if (opts.dropNoise && NOISE_PATTERNS.some(re => re.test(line))) {
      // Preserve paragraph breaks: allow a single blank line between content blocks.
      if (line.trim() === '' && kept.length > 0 && kept[kept.length - 1].trim() !== '') {
        kept.push('');
      } else {
        droppedNoise++;
      }
      previous = line;
      continue;
    }

    if (opts.collapseRepeats && line === previous) {
      collapsed++;
      continue;
    }

    kept.push(line);
    previous = line;
  }

  let truncated = 0;
  let outputLines = kept;
  if (opts.maxLines && kept.length > opts.maxLines) {
    // Keep the head and the tail: errors and final answers live at the end,
    // context and the invoked command live at the start.
    const head = Math.ceil(opts.maxLines * 0.4);
    const tail = opts.maxLines - head;
    truncated = kept.length - opts.maxLines;
    outputLines = [
      ...kept.slice(0, head),
      `... [DEXFILTER: ${truncated} lines elided] ...`,
      ...kept.slice(kept.length - tail)
    ];
  }

  return {
    text: outputLines.join('\n').trim(),
    stats: {
      rawLines,
      keptLines: outputLines.length,
      droppedNoise,
      collapsed,
      truncated
    }
  };
}

/**
 * Parse a DEX838 envelope without throwing.
 *
 * The canonical `parseDEX838` throws on malformed input and that behaviour is correct —
 * it must not be softened. But a PTY stream legitimately contains non-envelope prose,
 * so callers reading untrusted stdout need an explicit, visibly-different opt-in rather
 * than a parser that silently invents an `unscoped` envelope for anything it can't read.
 *
 * @returns {{ ok: true, envelope: object } | { ok: false, error: string, raw: string }}
 */
export function tryParseEnvelope(wireString) {
  try {
    return { ok: true, envelope: parseDEX838(String(wireString).trim()) };
  } catch (error) {
    return { ok: false, error: error.message, raw: String(wireString).trim() };
  }
}

/**
 * Does this envelope carry a hardcode qualifier — i.e. an irreversible action that must
 * pass the Layer 8 human approval gate before dispatch?
 *
 * Per DECISIONS.md Cluster F, the L8 `NullApprovalQueue` gate in packages/dexcli-core is to
 * be wired into CliPool's dispatch path using this detection. Ticket F1 does that wiring;
 * this function is the predicate it will call.
 */
export function requiresApproval(wireString) {
  const result = tryParseEnvelope(wireString);
  if (!result.ok) return false;
  const hardcode = result.envelope.qualifiers?.hardcode ?? [];
  return hardcode.length > 0;
}

export { HARDCODE_REGEX };
