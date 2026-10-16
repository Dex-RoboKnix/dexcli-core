# DexCLI

**Runs several Gemini CLI sessions side by side from one terminal.** DexCLI starts persistent Gemini CLI processes, sends each task to an idle one, collects the code blocks from their output and shows the results in a split-pane terminal UI. It uses your existing Gemini CLI sign-in, so it needs no API keys of its own. Pre-1.0 prototype.

## Install

Needs Node.js 18+, the Gemini CLI signed in, and C++ build tools for `node-pty` (Windows: Visual Studio with the C++ desktop workload; Linux: `build-essential`; macOS: `xcode-select --install`).

```bash
npm install -g @google/gemini-cli && gemini auth login
git clone https://github.com/Dex-RoboKnix/dexcli-core
cd dexcli-core && npm install && npm link
```
Readable: install and sign in to the Gemini CLI, then download DexCLI and make the `dexcli` command available.

## Use

```bash
dexcli                                                  # open the split-pane UI
dexcli "Build a REST API with Express and add unit tests"  # run one task and exit
cat tasks.txt | dexcli --no-tui > results.json           # run a list of tasks, save the results
dexcli --resume <session-id>                             # carry on a saved session
```

In the UI: `/status` (swarm status), `/artifacts` (collected code), `/save`, `/clear`, `/quit`.

## Configure

Settings live in `config/defaults.yaml` or a YAML file you pass in:

```yaml
gemini: { executable: 'gemini', args: ['chat'], readyString: '>' }
pool: { initialSize: 2, maxSize: 5 }
```
Readable: which Gemini command to start, and how many sessions to run (2 to begin with, 5 at most).

## Related

Part of [Dex RoboKnix](https://github.com/Dex-RoboKnix). The DEX838 standard is in [dexspine-core](https://github.com/Dex-RoboKnix/dexspine-core).

## Licence

AGPL-3.0-or-later. See [LICENSE](./LICENSE).
