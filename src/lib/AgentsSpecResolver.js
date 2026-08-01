/**
 * AgentsSpecResolver.js — workspace governance-spec resolver for dexcli.
 *
 * dexcli drives multiple vendors' agents, so it cannot treat CLAUDE.md as the rule file:
 * AGENTS.md is the provider-agnostic standard and therefore dexcli's default SSOT, with
 * CLAUDE.md ingested as a supplementary layer when present.
 *
 * Resolution walks upward from the working directory to the repo root, matching how the
 * agent CLIs themselves resolve context: an agent invoked in `src/lib/` must still see the
 * AGENTS.md at the project root.
 */

import fs from 'fs';
import path from 'path';

export const SPEC_MODES = {
  AGENTS_MD_PRIMARY: 'AGENTS.md', // Default — provider-agnostic multi-agent standard wins
  CLAUDE_MD_PRIMARY: 'CLAUDE.md', // Anthropic-specific file wins
  MERGED: 'MERGED'                // Both ingested, AGENTS.md wins on conflict
};

const SUPPLEMENT_DIVIDER = (name) => `\n\n--- [SUPPLEMENTARY: ${name}] ---\n\n`;

export class AgentsSpecResolver {
  /**
   * @param {string} workspaceDir directory to resolve from
   * @param {object} [options]
   * @param {boolean} [options.searchParents=true] walk up to the repo root looking for spec files
   * @param {number}  [options.maxDepth=10] parent-walk ceiling
   */
  constructor(workspaceDir = process.cwd(), options = {}) {
    this.workspaceDir = workspaceDir;
    this.searchParents = options.searchParents !== false;
    this.maxDepth = options.maxDepth ?? 10;
  }

  /**
   * Locate a named spec file, walking upward. Stops at a `.git` directory (repo root) so a
   * parent project's rules never leak into a nested repo.
   * @returns {string|null} absolute path, or null
   */
  _findSpecFile(filename) {
    let dir = path.resolve(this.workspaceDir);
    for (let depth = 0; depth <= this.maxDepth; depth++) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) return candidate;
      if (!this.searchParents) return null;
      if (fs.existsSync(path.join(dir, '.git'))) return null; // repo root, stop

      const parent = path.dirname(dir);
      if (parent === dir) return null; // filesystem root
      dir = parent;
    }
    return null;
  }

  /**
   * Count actionable rules — imperative bullets and numbered directives — rather than every
   * markdown bullet, so the number means something when shown to the user at setup.
   */
  _countRules(content) {
    const bullets = content.match(/^\s*(?:[-*+]|\d+\.)\s+\S.*$/gm) || [];
    return bullets.filter(line => !/^\s*[-*+]\s*\[[ x]\]/i.test(line)).length;
  }

  /**
   * @param {string} [preferredPrimary] one of SPEC_MODES
   * @returns {{activeSsot: string, preferredPrimary: string, sources: string[], rawContent: string, rulesCount: number, foundAgentsMd: boolean, foundClaudeMd: boolean}}
   */
  resolveSpec(preferredPrimary = SPEC_MODES.AGENTS_MD_PRIMARY) {
    if (!Object.values(SPEC_MODES).includes(preferredPrimary)) {
      throw new Error(
        `Unknown spec mode: "${preferredPrimary}". Valid modes: ${Object.values(SPEC_MODES).join(', ')}`
      );
    }

    const agentsPath = this._findSpecFile('AGENTS.md');
    const claudePath = this._findSpecFile('CLAUDE.md');
    const read = (p) => fs.readFileSync(p, 'utf8');

    // Primary first, supplement appended. MERGED and AGENTS_MD_PRIMARY both put AGENTS.md
    // first (precedence is by order of ingestion); they differ only in reported SSOT, which
    // is what downstream prompt formatting cites as authority.
    let primaryPath = null;
    let supplementPath = null;

    if (preferredPrimary === SPEC_MODES.CLAUDE_MD_PRIMARY) {
      primaryPath = claudePath || agentsPath;
      supplementPath = claudePath ? agentsPath : null;
    } else {
      primaryPath = agentsPath || claudePath;
      supplementPath = agentsPath ? claudePath : null;
    }

    if (!primaryPath) {
      const fallback =
        '# AGENTS.md\nNo workspace AGENTS.md or CLAUDE.md found. ' +
        'Operating with default dexcli governance rules.';
      return {
        activeSsot: 'DEFAULT_INLINED',
        preferredPrimary,
        sources: [],
        rawContent: fallback,
        rulesCount: 0,
        foundAgentsMd: false,
        foundClaudeMd: false
      };
    }

    const sources = [primaryPath];
    let rawContent = read(primaryPath);

    if (supplementPath) {
      rawContent += SUPPLEMENT_DIVIDER(path.basename(supplementPath)) + read(supplementPath);
      sources.push(supplementPath);
    }

    const bothPresent = Boolean(agentsPath && claudePath);
    const activeSsot = (preferredPrimary === SPEC_MODES.MERGED && bothPresent)
      ? SPEC_MODES.MERGED
      : path.basename(primaryPath);

    return {
      activeSsot,
      preferredPrimary,
      sources,
      rawContent,
      rulesCount: this._countRules(rawContent),
      foundAgentsMd: Boolean(agentsPath),
      foundClaudeMd: Boolean(claudePath)
    };
  }
}
