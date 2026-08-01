import { TaskDecomposer } from './TaskDecomposer.js';
import { ArtifactParser } from './ArtifactParser.js';
import { AgentsSpecResolver, SPEC_MODES } from './AgentsSpecResolver.js';

export class Orchestrator {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = config;
    this.decomposer = new TaskDecomposer();
    this.parser = new ArtifactParser();
    this.executionLog = [];
    // F4: workspace AGENTS.md/CLAUDE.md rules must reach the L1 agent's prompts, not just
    // live in the repo unread. Resolved once per Orchestrator instance (not per task) —
    // spec files don't change mid-run, and re-reading per task would just be I/O for no
    // benefit. Callers can inject a resolver for testing or a non-default workspace.
    this.specResolver = config.specResolver instanceof AgentsSpecResolver
      ? config.specResolver
      : new AgentsSpecResolver(config.workspaceDir || process.cwd());
    this.specMode = config.specMode || SPEC_MODES.AGENTS_MD_PRIMARY;
    this._spec = null;
  }

  /** Lazily resolve and cache the governance spec for this run. */
  getSpec() {
    if (!this._spec) {
      this._spec = this.specResolver.resolveSpec(this.specMode);
    }
    return this._spec;
  }

  /** Prefix a task prompt with the resolved workspace governance spec. */
  formatPrompt(prompt) {
    const spec = this.getSpec();
    return `[GOVERNANCE SPEC — SSOT: ${spec.activeSsot}]\n${spec.rawContent}\n\n[TASK]\n${prompt}`;
  }

  async execute(userPrompt) {
    const startTime = Date.now();
    let tasks;
    if (this.config.smartDecompose) {
      tasks = await this.decomposer.smartDecompose(userPrompt, this.pool);
    } else {
      tasks = this.decomposer.decompose(userPrompt);
    }

    const results = await this.executeParallel(tasks);
    
    const allArtifacts = [];
    results.forEach(res => {
      const artifacts = this.parser.parse(res.response, {
        instanceId: res.instanceId,
        role: res.role,
        taskId: res.taskId
      });
      allArtifacts.push(...artifacts);
    });

    const summary = {
      taskCount: tasks.length,
      artifactCount: allArtifacts.length,
      executionTime: Date.now() - startTime,
      tasks: results,
      artifacts: allArtifacts
    };

    this.executionLog.push(summary);
    return summary;
  }

  async executeParallel(tasks) {
    // Group tasks by priority
    const priorityGroups = {};
    tasks.forEach(task => {
      if (!priorityGroups[task.priority]) priorityGroups[task.priority] = [];
      priorityGroups[task.priority].push(task);
    });

    const sortedPriorities = Object.keys(priorityGroups).sort((a, b) => a - b);
    const allResults = [];

    for (const priority of sortedPriorities) {
      const groupTasks = priorityGroups[priority];
      const groupResults = await Promise.all(
        groupTasks.map(async task => {
          try {
            const res = await this.pool.execute(this.formatPrompt(task.prompt), { role: task.role });
            return { ...res, taskId: task.id };
          } catch (err) {
            return { taskId: task.id, error: err.message, response: '' };
          }
        })
      );
      allResults.push(...groupResults);
    }

    return allResults;
  }
}
