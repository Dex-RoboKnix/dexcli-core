import { TaskDecomposer } from './TaskDecomposer.js';
import { ArtifactParser } from './ArtifactParser.js';

export class Orchestrator {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = config;
    this.decomposer = new TaskDecomposer();
    this.parser = new ArtifactParser();
    this.executionLog = [];
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
            const res = await this.pool.execute(task.prompt, { role: task.role });
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
