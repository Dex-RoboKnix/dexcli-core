# DexCLI Core Repo Status

This repo has been seeded from the working DexCLI terminal-agent prototype.

## Current State

- Node-based CLI prototype.
- `node-pty` terminal process management.
- Agent pool and task routing.
- TUI prototype.
- Artifact parser.
- Mock test suite.

## Known Caveat

The current source is still Gemini-first. Canonical DexCLI is provider-agnostic and should treat Gemini as the first provider adapter, not the whole product.

Local validation passed with `npm test`, but Windows/Node 24 emitted a post-test `node-pty` `AttachConsole failed` message. Fix or pin this before production claims.

## Next Work

1. Introduce provider adapter interfaces.
2. Move Gemini-specific logic behind `providers/gemini`.
3. Add deterministic `providers/mock`.
4. Implement actual role prompt dispatch.
5. Harden artifact path handling.
6. Add DexSpine `dex()` task envelope support.

