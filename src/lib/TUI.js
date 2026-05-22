import blessed from 'blessed';

export class TUI {
  constructor({ pool, orchestrator, session, config }) {
    this.pool = pool;
    this.orchestrator = orchestrator;
    this.session = session;
    this.config = config;
    
    this.allArtifacts = [];
    this.commandHistory = [];
    this.historyIndex = -1;
    this.isExecuting = false;

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'DexCLI — Gemini Swarm'
    });

    this.buildLayout();
    this.bindKeys();
    this.setupEvents();
    this.startStatusRefresh();
  }

  buildLayout() {
    const { tui } = this.config;

    this.statusBar = blessed.box({
      top: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: tui.statusColor || 'cyan' } },
      tags: true,
      label: ' DexCLI — Gemini Swarm '
    });

    this.outputPane = blessed.log({
      top: 3,
      width: '100%',
      height: '100%-9',
      border: { type: 'line' },
      style: { border: { fg: tui.geminiColor || 'blue' } },
      tags: true,
      label: ' Gemini Swarm Output ',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: { fg: 'blue' }
      },
      mouse: true
    });

    this.artifactBar = blessed.box({
      bottom: 3,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      label: ' Artifacts ',
      tags: true,
      content: 'No artifacts yet'
    });

    this.inputBox = blessed.textarea({
      bottom: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: tui.inputColor || 'green' },
        focus: { border: { fg: 'yellow' } }
      },
      inputOnFocus: true,
      label: ' > Enter prompt or /command '
    });

    this.screen.append(this.statusBar);
    this.screen.append(this.outputPane);
    this.screen.append(this.artifactBar);
    this.screen.append(this.inputBox);

    this.inputBox.focus();
    this.renderStatus();
  }

  bindKeys() {
    this.screen.key(['C-c'], () => this.shutdown());
    this.screen.key(['C-s'], () => this.saveSession());
    this.screen.key(['escape'], () => this.inputBox.focus());
    this.screen.key(['C-l'], () => {
      this.outputPane.setContent('');
      this.screen.render();
    });

    this.inputBox.key(['enter'], () => {
      this.handleInput();
      return false; // prevent default
    });

    this.inputBox.key(['up'], () => {
      if (this.commandHistory.length === 0) return;
      if (this.historyIndex === -1) {
        this.currentInputDraft = this.inputBox.getValue();
        this.historyIndex = this.commandHistory.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
      this.inputBox.setValue(this.commandHistory[this.historyIndex]);
      this.screen.render();
    });

    this.inputBox.key(['down'], () => {
      if (this.historyIndex === -1) return;
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
        this.inputBox.setValue(this.commandHistory[this.historyIndex]);
      } else {
        this.historyIndex = -1;
        this.inputBox.setValue(this.currentInputDraft || '');
      }
      this.screen.render();
    });
  }

  setupEvents() {
    this.pool.on('instance:data', ({ id, chunk }) => {
      // Stream LLM output to pane
      this.outputPane.log(`{blue-fg}[${id}]{/blue-fg} ${chunk}`);
    });

    this.pool.on('instance:ready', ({ id }) => {
      this.renderStatus();
    });

    this.pool.on('instance:crashed', ({ id }) => {
      this.outputPane.log(`{red-fg}[${id}] CRASHED{/red-fg}`);
      this.renderStatus();
    });

    this.pool.on('pool:degraded', ({ healthy, total }) => {
      this.outputPane.log(`{yellow-fg}Warning: Pool degraded (${healthy}/${total} instances healthy){/yellow-fg}`);
    });
  }

  async handleInput() {
    const text = this.inputBox.getValue().trim();
    this.inputBox.clearValue();
    this.historyIndex = -1;
    this.currentInputDraft = '';

    if (!text) return;
    this.commandHistory.push(text);

    if (text.startsWith('/')) {
      this.handleCommand(text);
    } else {
      this.outputPane.log(`{bold}You:{/bold} ${text}`);
      this.isExecuting = true;
      this.renderStatus();

      try {
        const result = await this.orchestrator.execute(text);
        this.allArtifacts.push(...result.artifacts);
        this.updateArtifactBar();
        
        this.outputPane.log(`{green-fg}Execution complete: ${result.taskCount} tasks, ${result.artifactCount} artifacts.{/green-fg}`);
      } catch (err) {
        this.outputPane.log(`{red-fg}Error: ${err.message}{/red-fg}`);
      } finally {
        this.isExecuting = false;
        this.renderStatus();
      }
    }
    this.screen.render();
  }

  handleCommand(text) {
    const [cmd, ...args] = text.slice(1).split(' ');
    switch (cmd) {
      case 'status':
        const status = this.pool.getStatus();
        this.outputPane.log(`{cyan-fg}Pool Status:{/cyan-fg} ${JSON.stringify(status)}`);
        break;
      case 'help':
        this.outputPane.log('{bold}Available Commands:{/bold}');
        this.outputPane.log('/status - Show swarm status');
        this.outputPane.log('/help - Show this message');
        this.outputPane.log('/save - Save current session');
        this.outputPane.log('/artifacts - List collected artifacts');
        this.outputPane.log('/clear - Clear output pane');
        this.outputPane.log('/quit - Graceful shutdown');
        break;
      case 'save':
        this.saveSession();
        break;
      case 'artifacts':
        if (this.allArtifacts.length === 0) {
          this.outputPane.log('No artifacts collected yet.');
        } else {
          this.outputPane.log('{bold}Collected Artifacts:{/bold}');
          this.allArtifacts.forEach((a, i) => {
            this.outputPane.log(`[${i}] ${a.filename} (${a.language})`);
          });
        }
        break;
      case 'clear':
        this.outputPane.setContent('');
        break;
      case 'quit':
        this.shutdown();
        break;
      default:
        this.outputPane.log(`{red-fg}Unknown command: ${cmd}. Type /help for assistance.{/red-fg}`);
    }
  }

  renderStatus() {
    const status = this.pool.getStatus();
    let statusStr = '';
    
    this.pool.instances.forEach(i => {
      let emoji = '⚪';
      if (i.status === 'idle') emoji = '🟢';
      if (i.status === 'busy') emoji = '🟡';
      if (i.status === 'failed' || i.status === 'killed') emoji = '🔴';
      statusStr += `${emoji} ${i.id} `;
    });

    const executionStatus = this.isExecuting ? '{yellow-fg}⚙ EXECUTING{/yellow-fg}' : '{green-fg}READY{/green-fg}';
    this.statusBar.setContent(` Swarm: ${statusStr} | Queue: ${this.pool.taskQueue.length} | Status: ${executionStatus} `);
    this.screen.render();
  }

  updateArtifactBar() {
    if (this.allArtifacts.length === 0) {
      this.artifactBar.setContent('No artifacts yet');
    } else {
      const names = this.allArtifacts.map(a => a.filename).join(', ');
      this.artifactBar.setContent(`{bold}Artifacts (${this.allArtifacts.length}):{/bold} ${names}`);
    }
    this.screen.render();
  }

  startStatusRefresh() {
    this.statusInterval = setInterval(() => this.renderStatus(), 2000);
  }

  async saveSession() {
    try {
      const path = await this.session.save({
        instances: this.pool.instances.map(i => i.toJSON()),
        artifacts: this.allArtifacts,
        executionLog: this.orchestrator.executionLog
      });
      this.outputPane.log(`{green-fg}Session saved to ${path}{/green-fg}`);
    } catch (err) {
      this.outputPane.log(`{red-fg}Failed to save session: ${err.message}{/red-fg}`);
    }
  }

  async shutdown() {
    clearInterval(this.statusInterval);
    this.outputPane.log('Shutting down Gemini swarm...');
    await this.saveSession();
    await this.pool.shutdown();
    this.screen.destroy();
    process.exit(0);
  }

  start() {
    this.screen.render();
  }
}
