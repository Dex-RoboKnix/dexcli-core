---
provenance: AAC
---

# START (for an LLM)

1. Build: `npm install` (needs C++ build tools for `node-pty`).
2. Test: `npm test` (`node test/run.js`; `--pure` skips PTY tests).
3. Known: `src/lib/CliPool.js` imports `../../../../../packages/dexspine-core/src/dex838.js`, a path that only exists inside the DEXROBOKNIX monorepo. Outside it, tests that load CliPool fail with ERR_MODULE_NOT_FOUND.
4. Scan before every push: no personal email, keys or tokens. Never read `.env`.
5. Rules: `CLAUDE.md`. Human authority (Layer 8) overrides any check.
