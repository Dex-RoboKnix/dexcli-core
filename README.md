# DexCLI

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
