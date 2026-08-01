# Handoff Report: DexCLI Unauthenticated Provider Timeout Fix

## Executive Summary
This handoff document details the root cause analysis, implementation fix, and regression test verification for the DexCLI timeout issue where launching `node bin/dexcli "say hello"` or `node bin/dexcli --no-ade-bridge "say hello"` resulted in a generic `❌ Error: Ready timeout after 5000ms` without attempting or reporting authentication failures.

---

## 1. Problem Statement & Initial Symptom
- **Command:** `node bin/dexcli "say hello"` (run from `dexspine/dexcli/core`)
- **Initial Output:**
  ```text
  🚀 DexCLI v1.0.0 — Starting Gemini Swarm...
  ❌ Error: Ready timeout after 5000ms
  ```
- **Symptom:** The CLI hung for 5000ms before failing with a generic timeout message. No authentication prompts or actionable error messages were presented to the user.

---

## 2. Root Cause Analysis
- **Provider Authentication State:**
  - `claude` CLI: Unauthenticated (`Not logged in · Please run /login`).
  - `gemini` CLI: Unauthenticated (`oauth-personal` auth type in `~/.gemini/settings.json` is deprecated by Google, returning `"Failed to sign in: This client is no longer supported for Gemini Code Assist for individuals"` / interactive login dialog).
- **Default Spawn Configuration Defect:**
  - `defaults.yaml`, `geminiProvider`, and `ConfigLoader` defaulted `gemini` args to `['chat']`. `gemini` CLI (v0.52/v0.53) has no `chat` subcommand and treats `'chat'` as an initial query prompt in interactive mode, causing the process to block.
- **Missing Early Failure Path:**
  - `CliInstance.start()` had no pre-flight executable or authentication validation. It passively waited for the ready prompt string (`>`) in the PTY output stream. When unauthenticated providers outputted error banners or login prompts rather than `readyString`, `CliInstance` waited out the full 5000ms `readyTimeout` timer before throwing a generic timeout error.

---

## 3. Implemented Fixes

### A. Pre-Flight Provider & Authentication Validation ([src/lib/CliInstance.js](src/lib/CliInstance.js))
- Added `resolveAndValidateExecutable()` to verify executable existence on system PATH and resolve Windows batch executables (`.cmd`).
- Added `checkProviderAuth()` in `CliInstance.start()` to validate authentication pre-flight:
  - Detects `oauth-personal` deprecation and unauthenticated CLI states before spawning PTY instances.
  - Rejects `CliInstance.start()` **immediately (< 200ms)** with a distinct, clear error message.
- Enhanced `_detectAuthError()` pattern matcher in `_handleData()` and `onExit` to catch unexpected auth prompts or startup exits cleanly.

### B. Corrected Default Provider Spawn Arguments
- Updated default `gemini` args from `['chat']` to `[]` in:
  - [config/defaults.yaml](config/defaults.yaml)
  - [src/providers/gemini.js](src/providers/gemini.js)
  - [src/lib/ConfigLoader.js](src/lib/ConfigLoader.js)

### C. Regression Test Suite Integration
- Created [test/unauthenticated-provider.test.js](test/unauthenticated-provider.test.js) to assert:
  1. Fast failure (< 1000ms duration, verifying absence of 5000ms timeout).
  2. Distinct error message containing explicit provider authentication failure details.
- Integrated the regression test into [test/run.js](test/run.js).

---

## 4. Verification & Output Snapshot

### Repro Command Verification
```bash
node bin/dexcli "say hello"
```
**Output:**
```text
🚀 DexCLI v1.0.0 — Starting Gemini Swarm...

❌ Error: Provider "gemini" (executable: gemini.cmd) is unauthenticated: OAuth Personal login is no longer supported for Gemini CLI. Please set GEMINI_API_KEY or authenticate Gemini CLI.
```
- **Duration:** < 100ms (Fail-fast before the 5000ms timer).

### Regression Test Suite Verification
```bash
node test/unauthenticated-provider.test.js
```
**Output:**
```text
--- Regression Test: Unauthenticated / Missing Provider Error ---
Duration: 161ms
Caught error message: "Provider "gemini" (executable: gemini.cmd) is unauthenticated: OAuth Personal login is no longer supported for Gemini CLI. Please set GEMINI_API_KEY or authenticate Gemini CLI."
✅ Fast failure verified: failed before 5000ms timeout
✅ Distinct error message verified
--- Regression Test Passed ---
```

---

## 5. Items for Claude Agent Review
1. Confirm pre-flight auth checks in `CliInstance.js` cover all required provider auth strategies for future providers (e.g. OpenRouter / OpenAI / Ollama).
2. Validate that `checkProviderAuth` gracefully handles non-interactive CLI environments (`AGY` / Antigravity harness).
