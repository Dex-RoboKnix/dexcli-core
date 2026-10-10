---
provenance: AAC
layer: L2
---

# DexCLI (dexcli-core)

**Layer: L2.** DexCLI is the Gemini-first multi-agent swarm orchestrator, shipped via terminal and web. It conforms to DEX838 (L1, in [dexspine-core](https://github.com/Dex-RoboKnix/dexspine-core)). Pre-1.0 prototype, not a shipped product.

**Not used by dex.md directly.** dex.md does not install or pin this repo.

**Licence.** OpenCore: AGPL-3.0 Core. No Enterprise edition exists yet. See "Licence" below for a conflict to resolve.

## Which document do I read?

| You are | Read |
|---|---|
| An agent working on this repo | `START.md`, then `CLAUDE.md` |
| A person working on this repo | `docs/README.md` |
| Releasing | `RELEASING.md` |
| After the product itself | the original README below |

## Original README

### DexCLI (original)

> **Canonical copy:** This is the canonical interactive TUI swarm orchestrator with real PTY execution; `packages/dexcli-core` contains the canonical Layer 8 safety-gate logic (`NullApprovalQueue`) to be integrated into this orchestrator.

Gemini CLI swarm orchestrator. 2 instances. $0.02 per feature.

DexCLI is a terminal multiplexer that spawns persistent Gemini CLI processes via pseudo-terminals, routes tasks to idle instances, extracts artifacts from output, and presents results in a split-pane TUI.

It is NOT an API wrapper. It is a process orchestrator that inherits your native Gemini CLI authentication. This means zero API keys required, zero extra costs beyond your Gemini CLI usage, and full privacy.

## Features

- **Gemini Swarm:** Run multiple Gemini sessions in parallel for faster task completion.
- **TUI Interface:** A beautiful split-pane terminal UI using `blessed`.
- **Artifact Extraction:** Automatically extracts code blocks from Gemini's output and saves them.
- **Session Persistence:** Save and resume your work sessions.
- **Zero API Keys:** Uses your existing `gemini-cli` authentication.

## Installation

### Prerequisites

1.  **Node.js 18+**
2.  **Gemini CLI:** Install and authenticate via `npm install -g @google/gemini-cli && gemini auth login`.
3.  **Build Tools:** `node-pty` requires C++ build tools.
    -   **Windows:** `npm install --global windows-build-tools` or install Visual Studio with C++ desktop workload.
    -   **Linux:** `sudo apt install build-essential`
    -   **macOS:** `xcode-select --install`

### Install DexCLI

```bash
git clone https://github.com/youruser/dexcli.git
cd dexcli
npm install
npm link
```

## Usage

### Interactive TUI

```bash
dexcli
```

### Single-Shot Mode

```bash
dexcli "Build a REST API with Express and add unit tests"
```

### Piped Mode

```bash
cat tasks.txt | dexcli --no-tui > results.json
```

### Resume Session

```bash
dexcli --resume <session-id>
```

## Configuration

DexCLI can be configured via `config/defaults.yaml` or a custom YAML file.

```yaml
gemini:
  executable: 'gemini'
  args: ['chat']
  readyString: '>'
pool:
  initialSize: 2
  maxSize: 5
```

## Commands (Interactive)

-   `/status` - Show swarm status
-   `/artifacts` - List collected artifacts
-   `/save` - Save current session
-   `/clear` - Clear output pane
-   `/quit` - Graceful shutdown

## License

MIT

## Licence

`LICENSE` and `package.json` currently say MIT; the repo contract says AGPL-3.0 Core. Not changed here, awaiting the owner's decision.
