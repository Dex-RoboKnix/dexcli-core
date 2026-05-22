# SHADOWOS INTEGRATION: The Agent Desktop Visualization Layer
**Version:** 2.0 (Multi-Agent Swarm + Desktop UI)  
**Status:** FUTURE SCOPE SPECIFICATION  
**Mode:** Desktop-in-Chrome-Tab × 5 (One per Agent)

---

## EXECUTIVE SUMMARY

**What This Is:**
The convergence of three proven DEX technologies into a single unified platform:

1. **DEXCLI** (The Backend) — 5-agent swarm orchestrator via node-pty
2. **HaikuDexOS** (The Frontend) — macOS-like desktop PWA in Chrome tab
3. **NULL Queue** (The Control Layer) — Human approval interface

**The Vision:**
```
Human → NULL Queue (Approve Task) 
  ↓
DEXCLI (Decompose into 5 subtasks)
  ↓
5 × HaikuDexOS Instances (Each agent gets own desktop)
  ↓
Parallel Execution (Visual feedback per agent)
  ↓
Synthesized Output → Human Review
```

**The Innovation:**
Each AI agent gets its own **visual workspace** (macOS-like desktop in a Chrome tab) where you can watch it work in real-time: writing code in a text editor, running terminal commands, taking notes, managing files.

---

## THE ARCHITECTURE

### Layer 1: DEXCLI (The Orchestrator)

**From:** `dex.md` — The CLI swarm manager  
**Role:** Spawn 5 gemini CLI instances, route tasks, manage lifecycles

```
dexcli/
├── src/lib/CliInstance.js      # PTY wrapper for gemini CLI
├── src/lib/InstancePool.js     # 5-agent pool manager
├── src/lib/TaskDecomposer.js   # Break complex tasks into subtasks
├── src/lib/ArtifactParser.js   # Extract code from agent output
└── src/lib/Orchestrator.js     # Main execution engine
```

**What It Does:**
- Spawns 5 persistent `gemini chat` processes via node-pty
- Assigns roles: Dev, Tester, PM, Docs, Reviewer
- Routes subtasks to idle agents
- Collects artifacts (code files) from stdout

### Layer 2: ShadowOS (The Visualization)

**From:** `dex_handover.md` — The desktop-in-browser PWA  
**Role:** Give each agent a visual workspace to "operate" in

```
ShadowOS/
├── src/components/Desktop.jsx       # macOS-like desktop shell
├── src/components/Window.jsx        # Draggable, resizable windows
├── src/apps/DexCodex/              # Notes app (Obsidian clone)
├── src/apps/Terminal/              # Terminal emulator
├── src/apps/Finder/                # File browser (future)
└── src/state/windowManager.js      # Window z-index, focus, minimize
```

**What It Does:**
- Renders a macOS-like UI in the browser
- Window management (drag, resize, minimize, close)
- Apps: Notes (DexCodex), Terminal, Finder
- Persists state to localStorage
- Glassmorphism aesthetic (dark mode, emerald/cyan accents)

### Layer 3: NULL Queue (The Control Layer)

**From:** `nulldex.md` — The HITL approval interface  
**Role:** Human approves tasks before agents execute

```
NULL Queue/
├── approval-ui.html        # Tinder-for-Enterprise swipe cards
├── risk-scorer.py          # Score tasks 0-100
├── approval-sync.py        # Bridge to DEXCLI
└── decision-log/           # Audit trail
```

**What It Does:**
- Present AI plans to humans as swipeable cards
- Risk score each plan (0-100)
- On approval, send to DEXCLI for execution
- Log all decisions for compliance

---

## THE INTEGRATION CONCEPT

### The User Experience

**Step 1: Human Requests Task**
```bash
$ dexcli "Build a TODO app with React frontend and Node.js backend"
```

**Step 2: NULL Queue Presents Approval Card**
```
┌─────────────────────────────────┐
│ RISK SCORE: 45/100 ⚠️           │
├─────────────────────────────────┤
│ GOAL:                           │
│ "Build a TODO app with React    │
│  frontend and Node.js backend"  │
├─────────────────────────────────┤
│ PROPOSED STEPS:                 │
│ 1. Agent 1 (Dev): Build React   │
│    frontend with useState       │
│ 2. Agent 2 (Dev): Build Express │
│    backend with /api/todos      │
│ 3. Agent 3 (Tester): Write Jest │
│    tests for both                │
│ 4. Agent 4 (Docs): Create README│
│ 5. Agent 5 (Reviewer): Code     │
│    review all artifacts         │
├─────────────────────────────────┤
│   [REJECT] 👈    👉 [APPROVE]   │
└─────────────────────────────────┘
```

**Step 3: Human Approves (Swipe Right)**

**Step 4: DEXCLI Spawns 5 ShadowOS Instances**
```
Chrome opens 5 tabs:
- Tab 1: Agent 1 (Dev) Desktop
- Tab 2: Agent 2 (Dev) Desktop
- Tab 3: Agent 3 (Tester) Desktop
- Tab 4: Agent 4 (Docs) Desktop
- Tab 5: Agent 5 (Reviewer) Desktop
```

**Step 5: Each Agent "Works" in Its Own Desktop**

**Agent 1's Desktop (React Frontend):**
```
┌─────────────────────────────────────────────┐
│ 🔴 🟡 🟢  Agent 1 (Dev) - React Frontend    │
├─────────────────────────────────────────────┤
│                                             │
│ ┌────────────┐  ┌────────────────────────┐ │
│ │ Notes      │  │ Terminal               │ │
│ ├────────────┤  ├────────────────────────┤ │
│ │ Task:      │  │ $ npm create vite@latest│ │
│ │ Build React│  │ ✔ Project name: todo-app│ │
│ │ frontend   │  │ ✔ Framework: React      │ │
│ │            │  │ ✔ Variant: JavaScript   │ │
│ │ Progress:  │  │                         │ │
│ │ [██████░░] │  │ $ cd todo-app           │ │
│ │ 60%        │  │ $ npm install           │ │
│ └────────────┘  │ ... installing deps     │ │
│                 └────────────────────────┘ │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ src/App.jsx                          │   │
│ ├──────────────────────────────────────┤   │
│ │ import { useState } from 'react'     │   │
│ │                                       │   │
│ │ function App() {                      │   │
│ │   const [todos, setTodos] = useState │   │
│ │   ...                                 │   │
│ └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Agent 3's Desktop (Testing):**
```
┌─────────────────────────────────────────────┐
│ 🔴 🟡 🟢  Agent 3 (Tester) - Jest Tests     │
├─────────────────────────────────────────────┤
│                                             │
│ ┌────────────┐  ┌────────────────────────┐ │
│ │ Notes      │  │ Terminal               │ │
│ ├────────────┤  ├────────────────────────┤ │
│ │ Waiting for│  │ $ npm test             │ │
│ │ Agent 1 &  │  │                         │ │
│ │ Agent 2 to │  │ WAIT Test Suites: 0/5  │ │
│ │ finish...  │  │ (Waiting for deps...)   │ │
│ │            │  │                         │ │
│ │ Status:    │  │                         │ │
│ │ [░░░░░░░░] │  │                         │ │
│ │ 0% (idle)  │  │                         │ │
│ └────────────┘  └────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

**Step 6: Artifacts Synthesized**
All 5 agents complete their tasks. DEXCLI collects:
- Agent 1: `todo-app/src/App.jsx`, `todo-app/src/components/TodoList.jsx`
- Agent 2: `backend/server.js`, `backend/routes/todos.js`
- Agent 3: `todo-app/tests/App.test.jsx`, `backend/tests/todos.test.js`
- Agent 4: `README.md`, `CONTRIBUTING.md`
- Agent 5: `REVIEW.md` (code review notes)

**Step 7: Human Reviews Final Output**
NULL Queue shows completed artifacts. Human swipes right → Deploy.

---

## THE TECHNICAL IMPLEMENTATION

### Component 1: DEXCLI-to-ShadowOS Bridge

**New File:** `src/lib/DesktopSpawner.js`

```javascript
// Spawns a ShadowOS instance per agent
class DesktopSpawner {
  constructor(instancePool) {
    this.pool = instancePool;
    this.desktops = new Map(); // agentId → chrome tab handle
  }

  async spawnDesktopForAgent(agentId, role) {
    // Open new Chrome tab with ShadowOS
    const url = `http://localhost:3000/agent/${agentId}?role=${role}`;
    const desktop = window.open(url, `agent-${agentId}`, 'width=1200,height=800');
    
    // Store tab handle
    this.desktops.set(agentId, desktop);
    
    // Set up bidirectional communication
    this.setupBridge(agentId, desktop);
  }

  setupBridge(agentId, desktop) {
    // Listen for messages from ShadowOS
    window.addEventListener('message', (event) => {
      if (event.data.source === 'shadowos' && event.data.agentId === agentId) {
        // Agent clicked "Run command" in Terminal
        if (event.data.type === 'execute_command') {
          const instance = this.pool.getInstance(agentId);
          instance.send(event.data.command);
        }
      }
    });

    // Stream agent output to ShadowOS Terminal
    const instance = this.pool.getInstance(agentId);
    instance.on('output', (line) => {
      desktop.postMessage({
        source: 'dexcli',
        type: 'terminal_output',
        data: line
      }, '*');
    });
  }
}
```

### Component 2: ShadowOS Agent Mode

**New File:** `ShadowOS/src/modes/AgentMode.jsx`

```javascript
// Renders a desktop customized for a specific agent role
export function AgentMode({ agentId, role }) {
  const [status, setStatus] = useState('idle');
  const [currentTask, setCurrentTask] = useState(null);
  const [progress, setProgress] = useState(0);

  // Listen for messages from DEXCLI
  useEffect(() => {
    window.addEventListener('message', (event) => {
      if (event.data.source === 'dexcli') {
        if (event.data.type === 'task_assigned') {
          setCurrentTask(event.data.task);
          setStatus('working');
        }
        if (event.data.type === 'terminal_output') {
          // Update Terminal app with new output
          terminalRef.current.appendLine(event.data.data);
        }
        if (event.data.type === 'task_complete') {
          setStatus('complete');
          setProgress(100);
        }
      }
    });
  }, []);

  return (
    <Desktop theme={getRoleTheme(role)}>
      <Window app="Notes" title={`${role} - Task Notes`}>
        <div>Current Task: {currentTask?.description}</div>
        <ProgressBar value={progress} />
      </Window>
      
      <Window app="Terminal" title={`${role} - Execution Log`}>
        <TerminalEmulator ref={terminalRef} />
      </Window>
      
      <Window app="CodeEditor" title={`${role} - Artifacts`}>
        <CodeEditor files={currentTask?.artifacts} />
      </Window>
    </Desktop>
  );
}

function getRoleTheme(role) {
  const themes = {
    'Dev': { accent: '#10b981', name: 'Emerald' },
    'Tester': { accent: '#06b6d4', name: 'Cyan' },
    'PM': { accent: '#8b5cf6', name: 'Purple' },
    'Docs': { accent: '#f59e0b', name: 'Amber' },
    'Reviewer': { accent: '#ef4444', name: 'Red' }
  };
  return themes[role] || themes['Dev'];
}
```

### Component 3: Enhanced Task Decomposer

**Updated File:** `src/lib/TaskDecomposer.js`

```javascript
class TaskDecomposer {
  decompose(prompt) {
    // Use Gemini to self-decompose
    const decompositionPrompt = `
You are a task decomposer. Break this task into 5 subtasks:
"${prompt}"

Output JSON:
{
  "subtasks": [
    { "role": "Dev", "description": "...", "estimatedTime": "5m" },
    { "role": "Tester", "description": "...", "estimatedTime": "3m" },
    { "role": "PM", "description": "...", "estimatedTime": "2m" },
    { "role": "Docs", "description": "...", "estimatedTime": "4m" },
    { "role": "Reviewer", "description": "...", "estimatedTime": "3m" }
  ],
  "dependencies": {
    "Tester": ["Dev"],  // Tester waits for Dev
    "Reviewer": ["Dev", "Tester", "Docs"]  // Reviewer goes last
  }
}
    `;

    const response = this.pool.sendTask(decompositionPrompt);
    return JSON.parse(response);
  }

  orderByDependencies(subtasks, dependencies) {
    // Topological sort to respect dependencies
    // Dev → Tester → PM/Docs → Reviewer
    const ordered = [];
    const completed = new Set();

    while (ordered.length < subtasks.length) {
      for (const task of subtasks) {
        const deps = dependencies[task.role] || [];
        const canRun = deps.every(dep => completed.has(dep));
        
        if (canRun && !completed.has(task.role)) {
          ordered.push(task);
          completed.add(task.role);
        }
      }
    }

    return ordered;
  }
}
```

---

## THE VISUAL PROTOCOL

### Desktop Layout Standards

**Each Agent Desktop Must Have:**

1. **Notes App (DexCodex)**
   - Left pane: Task description
   - Right pane: Progress log
   - Auto-saves to localStorage

2. **Terminal App**
   - Receives stdout from gemini CLI via DEXCLI
   - Allows manual command execution (sends to gemini CLI)
   - Color-coded output (errors in red, success in green)

3. **Code Editor App** (Future)
   - Displays artifacts as they're generated
   - Syntax highlighting per file type
   - Read-only (human can't edit agent output mid-execution)

4. **Status Bar** (Bottom of desktop)
   - Agent role badge (e.g., "🛠️ Dev Agent")
   - Current status: Idle / Working / Complete / Error
   - Progress bar (0-100%)
   - Estimated time remaining

### Color Coding by Role

| Role | Accent Color | Use Case |
|------|--------------|----------|
| Dev | Emerald (#10b981) | Building features |
| Tester | Cyan (#06b6d4) | Writing tests |
| PM | Purple (#8b5cf6) | Planning & specs |
| Docs | Amber (#f59e0b) | Writing documentation |
| Reviewer | Red (#ef4444) | Code review & QA |

### Window Z-Index Hierarchy

```
Desktop Background:       z-index: 0
Minimized Windows:        z-index: 10
Background Windows:       z-index: 100
Active Window:            z-index: 200
Modal Dialogs:            z-index: 300
Error Overlays:           z-index: 400
```

---

## THE DEPLOYMENT FLOW

### Phase 1: Standalone DEXCLI (Current)

**What Works:**
- 5 gemini CLI instances via node-pty
- Task decomposition
- Artifact extraction
- No UI (terminal output only)

**Command:**
```bash
$ dexcli "Build a TODO app"
[Agent 1] Starting React build...
[Agent 2] Starting Express server...
[Agent 3] Waiting for dependencies...
...
[Orchestrator] All tasks complete. 12 files extracted.
```

### Phase 2: DEXCLI + ShadowOS Integration

**What's New:**
- `DesktopSpawner.js` opens Chrome tabs
- Each agent gets own ShadowOS instance
- Bidirectional bridge (DEXCLI ↔ ShadowOS)
- Visual feedback in browser

**Command:**
```bash
$ dexcli "Build a TODO app" --visual
Opening 5 agent desktops...
- Agent 1 (Dev): http://localhost:3000/agent/1
- Agent 2 (Dev): http://localhost:3000/agent/2
- Agent 3 (Tester): http://localhost:3000/agent/3
- Agent 4 (Docs): http://localhost:3000/agent/4
- Agent 5 (Reviewer): http://localhost:3000/agent/5

Watch progress in browser tabs.
Press Ctrl+C to stop all agents.
```

### Phase 3: NULL Queue Integration

**What's New:**
- Human approval required before execution
- Risk scoring (0-100)
- Audit trail for compliance

**Flow:**
```bash
$ dexcli "Deploy pricing model update"
Task requires approval (Risk Score: 75/100)
Opening NULL Queue... http://localhost:5000/approve

[Human swipes right in browser]

Approval received. Starting execution...
Opening 5 agent desktops...
```

---

## THE CARTRIDGE PHILOSOPHY INTEGRATION

### From dex_handover.md

**The Original Vision:**
> "We treat a project as a self-contained 'Cartridge' (ROM + SRAM) and enforce strict atomic execution (Flash Frames) via a Conductor (Policy)."

**How This Applies to Multi-Agent ShadowOS:**

1. **The Cartridge = The Project**
   - `.dex/` folder contains all agent state
   - Each agent gets own subdirectory: `.dex/agents/agent-1/`, `.dex/agents/agent-2/`, etc.
   - Agent state = SRAM (can be saved/loaded)

2. **The ROM = The Spec**
   - `dex.md`, `nulldex.md` are immutable ROMs
   - Agents read from ROM, write to SRAM
   - Human can swap ROMs (different task specs)

3. **The Battery Save = Git Commits**
   - After each agent completes task, commit to `.dex/agents/agent-X/state.json`
   - Rollback = `git revert` to previous agent state
   - "Time travel" debugging works across all 5 agents

4. **The Conductor = DEXCLI Orchestrator**
   - Enforces atomic execution (one subtask at a time per agent)
   - Validates dependencies (Tester waits for Dev)
   - Prevents "ghost file" bugs (checks file existence before task completion)

### The "Slot it in. It runs." Principle

**Current State:**
- HaikuDexOS: `npm run dev` → Desktop boots in browser
- DEXCLI: `npm run dev` → CLI orchestrator ready

**Future State:**
- Single command: `dexcli --visual "Build TODO app"`
- Opens 5 Chrome tabs (one per agent)
- Each tab runs HaikuDexOS
- Agents execute in parallel
- Human watches progress in real-time

**The Validation:**
Both systems already work standalone. Integration is just plumbing (DesktopSpawner bridge).

---

## THE TECHNICAL CHALLENGES

### Challenge 1: Cross-Tab Communication

**Problem:** DEXCLI runs in Node.js. ShadowOS runs in browser. How do they talk?

**Solution:** WebSocket bridge

```javascript
// In DEXCLI (Node.js server)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws, req) => {
  const agentId = req.url.split('=')[1];  // /ws?agent=1
  
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'execute_command') {
      const instance = pool.getInstance(agentId);
      instance.send(data.command);
    }
  });

  // Stream agent output to browser
  const instance = pool.getInstance(agentId);
  instance.on('output', (line) => {
    ws.send(JSON.stringify({ type: 'terminal_output', data: line }));
  });
});
```

```javascript
// In ShadowOS (Browser)
const ws = new WebSocket(`ws://localhost:8080?agent=${agentId}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'terminal_output') {
    terminalRef.current.appendLine(data.data);
  }
};

// Send command to DEXCLI
function executeCommand(cmd) {
  ws.send(JSON.stringify({ type: 'execute_command', command: cmd }));
}
```

### Challenge 2: State Synchronization

**Problem:** Agent state lives in 3 places:
1. gemini CLI (in-memory conversation)
2. DEXCLI InstancePool (task queue, status)
3. ShadowOS (UI state, notes, progress)

**Solution:** Single source of truth in `.dex/agents/agent-X/state.json`

```json
{
  "agentId": "agent-1",
  "role": "Dev",
  "status": "working",
  "currentTask": {
    "description": "Build React frontend",
    "progress": 60,
    "startedAt": "2026-02-07T04:30:00Z"
  },
  "conversationHistory": [
    { "role": "user", "content": "Build a React TODO app" },
    { "role": "assistant", "content": "I'll create a Vite project..." }
  ],
  "artifacts": [
    { "path": "src/App.jsx", "content": "...", "hash": "abc123" }
  ],
  "notes": [
    "Using Vite for faster dev server",
    "useState for local state management"
  ]
}
```

All three systems read/write this file via DEXCLI API.

### Challenge 3: Performance (5 Chrome Tabs)

**Problem:** 5 full React apps = memory-intensive

**Solution:** Already solved in HaikuDexOS via "Hibernation"

From `dex_handover.md`:
> "Implemented 'Hibernation' (DOM unmounting) successfully."

When an agent is idle, unmount its desktop DOM but keep WebSocket alive. Re-mount when agent gets new task.

```javascript
function AgentDesktop({ agentId, role }) {
  const [isHibernating, setIsHibernating] = useState(false);

  useEffect(() => {
    ws.on('task_assigned', () => setIsHibernating(false));
    ws.on('task_complete', () => {
      setTimeout(() => setIsHibernating(true), 5000);  // Hibernate after 5s idle
    });
  }, []);

  if (isHibernating) {
    return <HibernationScreen agentId={agentId} />;  // Minimal UI
  }

  return <Desktop>{/* Full desktop UI */}</Desktop>;
}
```

---

## THE BUSINESS VALUE

### Cost Analysis

**Traditional Development (Human):**
- 1 developer × 8 hours × $75/hr = **$600** per feature
- 5 developers × 8 hours × $75/hr = **$3,000** per complex feature

**DEXCLI (No Visual):**
- 5 Flash Lite agents × 10 minutes × $0.02/feature = **$0.10** per feature
- Fast, but opaque (no visibility into what agents are doing)

**DEXCLI + ShadowOS (Visual):**
- 5 Flash Lite agents × 10 minutes × $0.02/feature = **$0.10** per feature
- + 5 Chrome tabs × $0 (browser is free) = **$0.10** per feature
- **Same cost, but now you can watch the agents work**

### Time Analysis

**Traditional Development:**
- Complex feature: 8-40 hours (1-5 days)

**DEXCLI:**
- Same feature: 10-30 minutes (parallelized across 5 agents)
- **50-200x faster**

**DEXCLI + ShadowOS:**
- Same speed, but with visual feedback
- Human can interrupt/redirect mid-execution if needed

### Trust Analysis

**The Transparency Problem:**
When AI builds code autonomously, humans don't trust it because they can't see what it's doing.

**The ShadowOS Solution:**
- Each agent has a visible workspace
- Human can watch Terminal output in real-time
- Human can read Notes app to see agent's reasoning
- Human can see Code Editor to preview artifacts

**Result:** Trust increases because visibility increases. Humans approve more tasks because they understand agent behavior.

---

## THE IMPLEMENTATION ROADMAP

### Milestone 1: Standalone DEXCLI (Current State)

**Completed:**
- ✅ CliInstance.js (PTY wrapper)
- ✅ InstancePool.js (5-agent pool)
- ✅ ArtifactParser.js (code extraction)

**Remaining (Phase 2 from dex.md):**
- [ ] TaskDecomposer.js (self-decomposing task breakdown)
- [ ] Orchestrator.js (main execution pipeline)
- [ ] TUI.js (terminal-based status display)

**Estimated Time:** 2-3 hours (Flash Lite autonomous build)

### Milestone 2: ShadowOS Agent Mode

**New Components:**
- [ ] `ShadowOS/src/modes/AgentMode.jsx` (agent-specific desktop layout)
- [ ] `ShadowOS/src/apps/Terminal/index.jsx` (terminal emulator)
- [ ] `ShadowOS/src/components/StatusBar.jsx` (agent status display)
- [ ] `ShadowOS/src/hooks/useAgentBridge.js` (WebSocket connection)

**Estimated Time:** 3-4 hours (Pro model recommended for complex UI)

### Milestone 3: DEXCLI ↔ ShadowOS Bridge

**New Components:**
- [ ] `dexcli/src/lib/DesktopSpawner.js` (Chrome tab manager)
- [ ] `dexcli/src/lib/WebSocketServer.js` (bidirectional bridge)
- [ ] `dexcli/src/lib/StateSync.js` (persist agent state to `.dex/agents/`)

**Estimated Time:** 2-3 hours (Pro model recommended)

### Milestone 4: NULL Queue Integration

**New Components:**
- [ ] `dexcli/src/lib/ApprovalClient.js` (connect to NULL Queue API)
- [ ] `null-queue/approval-sync.py` (send approved tasks to DEXCLI)
- [ ] `null-queue/risk-scorer.py` (score tasks 0-100)

**Estimated Time:** 2-3 hours (Flash Lite can handle this)

### Milestone 5: End-to-End Test

**Test Case:** "Build a TODO app with React frontend and Node.js backend"

**Success Criteria:**
- [ ] NULL Queue presents approval card
- [ ] Human swipes right
- [ ] DEXCLI opens 5 Chrome tabs
- [ ] Each agent completes its subtask
- [ ] Terminal shows real-time output
- [ ] Artifacts extracted to disk
- [ ] Human reviews final code
- [ ] Deploy pipeline triggers

**Estimated Time:** 1 hour (testing + debugging)

**Total Implementation Time:** 10-15 hours

---

## THE VALIDATION EXPERIMENT

### Hypothesis

**Claim:** DEXCLI + ShadowOS provides better human oversight than DEXCLI alone, leading to higher approval rates and fewer post-execution corrections.

### Test Design

**Control Group:** DEXCLI (no visual feedback)
- Task: "Build a CRM system"
- Human gets terminal output only
- Measure: Approval rate, correction rate, time to review

**Experimental Group:** DEXCLI + ShadowOS (visual feedback)
- Same task: "Build a CRM system"
- Human watches 5 agent desktops in real-time
- Measure: Approval rate, correction rate, time to review

### Expected Results

**Control Group:**
- Approval rate: 60% (humans nervous about opaque AI)
- Correction rate: 30% (bugs found post-execution)
- Review time: 20 minutes (lots of code to read)

**Experimental Group:**
- Approval rate: 85% (humans trust what they can see)
- Correction rate: 15% (bugs caught mid-execution)
- Review time: 10 minutes (watched it being built)

**The Proof:** If experimental group shows higher approval + lower corrections, visual feedback is validated as a trust mechanism.

---

## THE FUTURE VISION

### Phase 1: Single-User (Current Scope)

- 1 human operator
- 5 AI agents
- Local execution (DEXCLI on laptop)
- Chrome tabs for visualization

### Phase 2: Multi-User (Enterprise)

- 10-100 human operators
- 50-500 AI agents (pool scales dynamically)
- Cloud deployment (DEXCLI on AWS/GCP)
- Web dashboard (not just Chrome tabs)

### Phase 3: Agent Marketplace

- Humans can "hire" specialized agents
- Agent roles beyond Dev/Tester/PM/Docs/Reviewer
- Examples: "UI/UX Agent", "Security Agent", "Performance Agent"
- Each agent has unique desktop theme/color

### Phase 4: Autonomous Teams

- Agents can spawn sub-agents
- Example: Dev agent spawns "Frontend Agent" + "Backend Agent"
- Hierarchical task decomposition
- Human approves top-level task, agents handle recursion

---

## CONCLUSION & NEXT STEPS

### What We've Proven

1. **HaikuDexOS Works:** Desktop-in-browser is real (built in single session, 68 files, 6K+ lines)
2. **DEXCLI Works:** 5-agent swarm orchestration via node-pty (validated by Gemini code review)
3. **NULL Queue Works:** HITL approval interface (built by Flash Lite, 91.4% success)

### What We're Proposing

**Combine all three into a unified platform:**

```
NULL Queue (Approval) → DEXCLI (Orchestration) → 5 × ShadowOS (Visualization)
```

**The Value:**
- Humans approve tasks in <30s (NULL Queue swipe interface)
- AI agents execute in parallel (DEXCLI 5-agent swarm)
- Humans watch in real-time (ShadowOS desktop per agent)
- Trust increases because visibility increases
- Speed increases because parallelization increases
- Cost decreases because Flash Lite is cheap

### For Layer 8 (Dan) Approval

**Three Decisions:**

1. **Build the Bridge?**
   - [ ] YES → Implement DesktopSpawner + WebSocketServer (Milestone 3)
   - [ ] NO → Keep DEXCLI and ShadowOS separate
   - [ ] DEFER → Focus on DEXCLI standalone first

2. **Run the Validation Experiment?**
   - [ ] YES → Test visual vs. non-visual feedback
   - [ ] NO → Trust the hypothesis
   - [ ] DEFER → Validate after integration

3. **Timeline?**
   - [ ] ASAP → Start this weekend (10-15 hours)
   - [ ] Next Week → Start Monday (spread over 5 days)
   - [ ] Future Scope → Add to backlog (revisit in 1 month)

**Remember:** "Because I said so" is valid syntax.

Layer 8 always wins.

---

## TECHNICAL APPENDIX

### File Structure (Integrated System)

```
workspace/
├── dexcli/                     # The Orchestrator
│   ├── bin/dexcli              # CLI entry point
│   ├── src/
│   │   ├── lib/
│   │   │   ├── CliInstance.js        # PTY wrapper
│   │   │   ├── InstancePool.js       # 5-agent pool
│   │   │   ├── TaskDecomposer.js     # Task breakdown
│   │   │   ├── ArtifactParser.js     # Code extraction
│   │   │   ├── Orchestrator.js       # Main engine
│   │   │   ├── DesktopSpawner.js     # NEW: Chrome tab manager
│   │   │   ├── WebSocketServer.js    # NEW: Bidirectional bridge
│   │   │   └── StateSync.js          # NEW: .dex/agents/ persistence
│   │   └── dexcli.js           # Main CLI
│   ├── config/
│   │   ├── defaults.yaml
│   │   └── roles.yaml
│   └── package.json
│
├── ShadowOS/                   # The Visualization Layer
│   ├── src/
│   │   ├── components/
│   │   │   ├── Desktop.jsx
│   │   │   ├── Window.jsx
│   │   │   └── StatusBar.jsx         # NEW: Agent status
│   │   ├── apps/
│   │   │   ├── DexCodex/             # Notes app
│   │   │   ├── Terminal/             # NEW: Terminal emulator
│   │   │   └── Finder/               # File browser (future)
│   │   ├── modes/
│   │   │   └── AgentMode.jsx         # NEW: Agent-specific layout
│   │   ├── hooks/
│   │   │   └── useAgentBridge.js     # NEW: WebSocket connection
│   │   └── state/
│   │       └── windowManager.js
│   ├── public/
│   └── package.json
│
├── null-queue/                 # The Control Layer
│   ├── approval-ui.html
│   ├── risk-scorer.py
│   ├── approval-sync.py        # NEW: Bridge to DEXCLI
│   └── decision-log/
│
├── .dex/                       # The Cartridge (State Persistence)
│   ├── agents/
│   │   ├── agent-1/
│   │   │   └── state.json      # Agent 1 state (Dev)
│   │   ├── agent-2/
│   │   │   └── state.json      # Agent 2 state (Dev)
│   │   ├── agent-3/
│   │   │   └── state.json      # Agent 3 state (Tester)
│   │   ├── agent-4/
│   │   │   └── state.json      # Agent 4 state (Docs)
│   │   └── agent-5/
│   │       └── state.json      # Agent 5 state (Reviewer)
│   ├── production_constraints.md
│   └── casper_identity.md
│
├── dex.md                      # DEXCLI Master Spec
├── nulldex.md                  # NULL Queue Master Spec
├── dex_handover.md             # ShadowOS Master Spec
└── shadowos-integration.md     # THIS DOCUMENT
```

### Dependency Graph

```
NULL Queue (Human Approval)
    ↓
DEXCLI (Task Orchestration)
    ↓
InstancePool (5 Agents)
    ↓
DesktopSpawner (Open Chrome Tabs)
    ↓
5 × ShadowOS Instances (Agent Desktops)
    ↓
WebSocket Bridge (DEXCLI ↔ ShadowOS)
    ↓
StateSync (.dex/agents/ Persistence)
    ↓
Artifacts Collected
    ↓
Human Review (Layer 8)
```

### Key APIs

**DEXCLI WebSocket API:**
```javascript
// Client → Server (ShadowOS → DEXCLI)
{
  type: 'execute_command',
  agentId: 'agent-1',
  command: 'npm install react'
}

// Server → Client (DEXCLI → ShadowOS)
{
  type: 'terminal_output',
  agentId: 'agent-1',
  data: 'added 235 packages in 12s'
}

{
  type: 'task_assigned',
  agentId: 'agent-1',
  task: {
    description: 'Build React frontend',
    role: 'Dev',
    estimatedTime: '5m'
  }
}

{
  type: 'task_complete',
  agentId: 'agent-1',
  artifacts: [
    { path: 'src/App.jsx', hash: 'abc123' }
  ]
}
```

**NULL Queue → DEXCLI API:**
```python
# approval-sync.py
import requests

def on_approval(task_id, task_data):
    response = requests.post('http://localhost:8081/api/execute', json={
        'task_id': task_id,
        'prompt': task_data['goal'],
        'visual': True  # Open ShadowOS desktops
    })
    return response.json()
```

---

**END OF SPECIFICATION**

---

**For Dan's Eyes Only:**

This is the convergence. Three systems, one vision:

1. **NULL** = Human Control (Approval Queue)
2. **DEXCLI** = Machine Execution (Agent Swarm)
3. **ShadowOS** = Visibility Layer (Desktop UI)

You built the first desktop-in-a-browser in a single session. That proved the "Cartridge" methodology works.

Now we're scaling it to 5 agents × 5 desktops × parallel execution.

**The question isn't "can it be done?"**  
**The question is: "Do you want to see 5 AI agents working in real-time, each in their own macOS-like workspace?"**

If yes, this is the spec. 10-15 hours. Flash Lite for backend, Pro for UI polish.

**This is a GO.**

Layer 8 decides.
