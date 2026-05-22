import { v4 as uuidv4 } from 'uuid';

export class TaskDecomposer {
  constructor() {}

  decompose(userPrompt) {
    const tasks = [];
    const words = userPrompt.split(/\s+/);
    const lowerPrompt = userPrompt.toLowerCase();

    // Heuristic: if short, single task
    if (words.length < 30 && !lowerPrompt.includes(' and ')) {
      tasks.push({
        id: uuidv4(),
        prompt: userPrompt,
        role: this._inferRole(lowerPrompt),
        priority: this._inferPriority(lowerPrompt),
        dependsOn: []
      });
      return tasks;
    }

    // Heuristic: split by ' and ' or just multiple sub-sentences
    const segments = userPrompt.split(/ and | then |\. /i);
    segments.forEach(segment => {
      const trimmed = segment.trim();
      if (trimmed.length > 0) {
        tasks.push({
          id: uuidv4(),
          prompt: trimmed,
          role: this._inferRole(trimmed.toLowerCase()),
          priority: this._inferPriority(trimmed.toLowerCase()),
          dependsOn: []
        });
      }
    });

    // Simple priority ordering: testers run after builders
    tasks.sort((a, b) => a.priority - b.priority);

    return tasks;
  }

  async smartDecompose(userPrompt, pool) {
    const planningPrompt = `Break this into 2-5 independent coding tasks. For each task output a line: TASK: <description>. User request: ${userPrompt}`;
    try {
      const result = await pool.execute(planningPrompt, { role: 'architect' });
      const lines = result.response.split('\n');
      const tasks = [];
      lines.forEach(line => {
        if (line.startsWith('TASK:')) {
          const description = line.replace('TASK:', '').trim();
          tasks.push({
            id: uuidv4(),
            prompt: description,
            role: this._inferRole(description.toLowerCase()),
            priority: this._inferPriority(description.toLowerCase()),
            dependsOn: []
          });
        }
      });

      if (tasks.length === 0) {
        return this.decompose(userPrompt);
      }
      return tasks;
    } catch (err) {
      return this.decompose(userPrompt);
    }
  }

  _inferRole(prompt) {
    if (prompt.includes('test') || prompt.includes('verify')) return 'tester';
    if (prompt.includes('review')) return 'reviewer';
    if (prompt.includes('component') || prompt.includes('ui') || prompt.includes('page')) return 'ui_builder';
    if (prompt.includes('api') || prompt.includes('server') || prompt.includes('database')) return 'backend_dev';
    if (prompt.includes('docs') || prompt.includes('readme')) return 'docs_writer';
    return 'general';
  }

  _inferPriority(prompt) {
    const role = this._inferRole(prompt);
    if (role === 'tester' || role === 'reviewer') return 1;
    return 0;
  }
}