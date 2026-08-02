# DexCLI Test Suite

This directory contains the test suite for DexCLI.

## Test Tiers

The test suite is divided into two distinct tiers:

### 1. Pure Tier (`npm run test:pure`)
Tests that run logic checks without initializing real PTY instances via `node-pty`, spawning processes, or issuing network/model calls.

- `phase1-check.js` — Core module exports and basic utility function sanity checks.
- `phase1a-auth.test.js` — Pure function provider authentication status, executable resolution, remedies, and detector registry checks.
- `unauthenticated-provider.test.js` — Fast-failure validation for missing or unauthenticated provider executables.
- `phase2-check.js` — TUI event handling and layout component verification using mock pools.
- `phase4-check.js` — ProviderRegistry, AgentsSpecResolver, DEX838 parser, and DEXFILTER reduction pipeline checks.
- `phase5-check.js` — Strategy mapping, prompt formatting, and production lock module checks.
- `phase6-check.js` — Setup wizard non-interactive logic and AdeBridge envelope/port checks.
- `approval-queue.test.js` — Interception and approval queue mechanics using mock instances.
- `production-lock.js` — Package integrity and forbidden module checks.
- `verify-config-loader.js` — Default configuration loading checks.
- `logger.test.js` — Logger level filtering, lazy dir/file creation, and append behavior.

### 2. PTY Tier (`npm run test:pty`)
Tests that require spawning real sub-processes or pseudo-terminals via `node-pty`.

- `smoke-test.js` — End-to-end swarm execution against a mock CLI process over PTY.
- `phase3-check.js` — Single-shot and piped mode integration tests via process execution.
- `pool-respawn-loop.test.js` — Regression test for the unbounded health-check respawn
  loop (the "agents looped" bug): drives `CliPool._healthCheckTick()` directly against a
  provider that can never become ready and asserts the pool gives up after
  `MAX_CONSECUTIVE_SPAWN_FAILURES` instead of spawning a new PTY process forever.

## Why the Split Exists

1. **Environmental Independence**: Native modules like `node-pty` may fail to build or load on certain CI or OS environments. Splitting the suite ensures core business logic errors are visually and logically distinguished from native binary build failures.
2. **Speed & Efficiency**: The `pure` tier runs quickly with minimal overhead and zero process spawning.
3. **Safety**: Pure tests guarantee no network calls or billable CLI operations are issued.
