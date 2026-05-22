— DEXCLI v1.0: GEMINI SWARM ORCHESTRATOR
Status: READY TO EXECUTE

Track ID: dexcli-v1-gemini-swarm

Model: Gemini Flash (single instance, sequential track execution)

Mode: AUTONOMOUS BATCH EXECUTION (NO INTERRUPTIONS) Vendor Lock: Gemini CLI only (v1.0 scope)

Critical Dependency: node-pty (pseudo-terminal for TTY emulation)

PRE-BUILD GATE
⚠️ HUMAN MUST VERIFY BEFORE FLASH EXECUTES:

Test 1: Does gemini-cli support persistent REPL?

gemini chat -> "Hello, what is 2+2?" -> Wait -> "What did I just ask you?"

If it remembers → REPL is stateful → PROCEED

Test 2: Does node-pty compile?

npm install node-pty -> node -e "require('node-pty')"

If exits 0 → PROCEED

[ ] REPL persistence confirmed [ ] node-pty compiles [ ] gemini-cli installed and authenticated

DO NOT EXECUTE TRACKS UNTIL ALL THREE BOXES ARE CHECKED.

MISSION
Build a terminal multiplexer that spawns 2-5 persistent gemini chat processes via pseudo-terminals, routes tasks to idle instances, extracts artifacts from stdout, and presents results in a split-pane terminal UI. Zero API keys — uses native gemini-cli authentication.

Not this: dexcli → API calls → Gemini service

This: dexcli → node-pty → N active gemini chat terminals → synthesized output

EXECUTION PROTOCOL
INSTRUCTION TO MODEL: You are the Build Agent. Your goal is to execute the Track Manifest below sequentially and autonomously.

Do not stop after each task.

Do not wait for user input or "Ctrl+T".

Execute T001. Verify output. Immediately execute T002.

Continue until T040 (Phase 1 completion).

Run the Phase 1 Self-Check.

If check passes, immediately proceed to Phase 2.

Output the content of every file you create clearly in code blocks.

TRACK MANIFEST
Phase 1: Foundation — Project Structure, PTY Core, Stream Cleaning (40 tracks)
[ ] T001: Create project directory structure

Action: Create dexcli/bin/, dexcli/src/lib/, dexcli/config/, dexcli/test/mocks/, dexcli/examples/.

Output: Directory tree confirmed.

[ ] T002: Create package.json

Action: Create dexcli/package.json with node-pty, blessed, uuid.

Output: Valid package.json.

[ ] T003: Create bin/dexcli entry point

Action: Create executable dexcli/bin/dexcli with shebang.

Output: Executable file.

[ ] T004: Create src/lib/AnsiCleaner.js

Action: Implement AnsiCleaner class with regex to strip ANSI codes.

Output: src/lib/AnsiCleaner.js.

[ ] T005: Create src/lib/CliInstance.js

Action: Implement CliInstance constructor and state management.

Output: src/lib/CliInstance.js.

[ ] T006: Implement CliInstance.spawn()

Action: Add node-pty spawn logic and data listeners.

Output: Updated CliInstance.js.

[ ] T007: Implement CliInstance.waitForReady()

Action: Add logic to detect > prompt in stdout.

Output: Updated CliInstance.js.

[ ] T008: Implement CliInstance.send()

Action: Add write/read logic with silence detection for response completion.

Output: Updated CliInstance.js.

[ ] T009: Implement CliInstance.assignRole()

Action: Add logic to send role-setting prompt to PTY.

Output: Updated CliInstance.js.

[ ] T010: Implement CliInstance.kill()

Action: Add graceful and forced shutdown logic.

Output: Updated CliInstance.js.

[ ] T011: Implement CliInstance.getStatus()

Action: Return status object.

Output: Updated CliInstance.js.

[ ] T012: Create src/lib/InstancePool.js

Action: Implement InstancePool class to manage N instances.

Output: src/lib/InstancePool.js.

[ ] T013: Implement InstancePool.initialize()

Action: Spawn initial set of instances.

Output: Updated InstancePool.js.

[ ] T014: Implement InstancePool.getIdle()

Action: Find available ready instance.

Output: Updated InstancePool.js.

[ ] T015: Implement InstancePool.waitForIdle()

Action: Queue requests when all instances busy.

Output: Updated InstancePool.js.

[ ] T016: Implement InstancePool.scaleUp()

Action: Dynamic scaling logic up to max instances.

Output: Updated InstancePool.js.

[ ] T017: Implement InstancePool.sendTask()

Action: Route task to idle instance, handle recycling.

Output: Updated InstancePool.js.

[ ] T018: Implement InstancePool.healthCheck()

Action: Periodic check for dead PTYs and respawn.

Output: Updated InstancePool.js.

[ ] T019: Implement InstancePool.shutdown()

Action: Clean cleanup of all PTYs.

Output: Updated InstancePool.js.

[ ] T020: Implement InstancePool.getStatus()

Action: Aggregate pool status.

Output: Updated InstancePool.js.

[ ] T021: Implement InstancePool Rate Limiting

Action: Add delays between requests to avoid CLI throttling.

Output: Updated InstancePool.js.

[ ] T022: Create src/lib/ArtifactParser.js

Action: Regex extraction of code blocks from cleaned output.

Output: src/lib/ArtifactParser.js.

[ ] T023: Implement ArtifactParser.inferFilename()

Action: Heuristic to name files based on content/comments.

Output: Updated ArtifactParser.js.

[ ] T024: Implement ArtifactParser.saveArtifacts()

Action: Write extracted files to disk with conflict handling.

Output: Updated ArtifactParser.js.

[ ] T025: Create src/lib/TaskDecomposer.js

Action: Logic to split complex prompts into subtasks.

Output: src/lib/TaskDecomposer.js.

[ ] T026: Implement TaskDecomposer Role Assignment

Action: Keyword matching to assign roles (dev, tester, etc).

Output: Updated TaskDecomposer.js.

[ ] T027: Implement TaskDecomposer Dependency Ordering

Action: Sort tasks (build before test).

Output: Updated TaskDecomposer.js.

[ ] T028: Create src/lib/Orchestrator.js

Action: Main engine wiring Pool, Decomposer, Parser.

Output: src/lib/Orchestrator.js.

[ ] T029: Implement Orchestrator.execute()

Action: Full pipeline execution flow.

Output: Updated Orchestrator.js.

[ ] T030: Implement Orchestrator Fast Path

Action: Optimization for simple, single-task prompts.

Output: Updated Orchestrator.js.

[ ] T031: Create src/lib/SessionState.js

Action: Save/Load session JSON to ~/.dexcli.

Output: src/lib/SessionState.js.

[ ] T032: Create src/lib/ConfigLoader.js

Action: Load YAML config with overrides.

Output: src/lib/ConfigLoader.js.

[ ] T033: Create src/lib/Logger.js

Action: Structured logging to file and console.

Output: src/lib/Logger.js.

[ ] T034: Create config/defaults.yaml

Action: Default configuration file.

Output: config/defaults.yaml.

[ ] T035: Create config/roles.yaml

Action: Role definitions and prompts.

Output: config/roles.yaml.

[ ] T036: Create src/dexcli.js

Action: Main CLI entry point and arg parsing.

Output: src/dexcli.js.

[ ] T037: Implement --help and --version

Action: Standard CLI flags.

Output: Updated dexcli.js.

[ ] T038: Implement Single-Prompt Mode

Action: Handle positional arguments as prompt.

Output: Updated dexcli.js.

[ ] T039: Implement Piped Stdin Mode

Action: Handle piped input for automation.

Output: Updated dexcli.js.

[ ] T040: Phase 1 Self-Check

Action: Create test/phase1-check.js to verify all classes and methods exist.

Output: test/phase1-check.js.

APPROVAL GATE
<|HUMAN_GATE|> [ ] Human verified REPL persistence [ ] Human verified node-pty compiles

After approval: Flash executes T001 through T040 continuously.

2-5 instances. 1 vendor. 1 orchestrator. node-pty. $0.02 per feature. Casper unstuck in the abacus.