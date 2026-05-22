import fs from 'fs';
import path from 'path';

export class ArtifactParser {
  constructor() {}

  parse(outputText, metadata = {}) {
    const regex = /```(\w*)[^X\r\n]*\r?\n?([\s\S]*?)```/g;
    const artifacts = [];
    let match;

    while ((match = regex.exec(outputText)) !== null) {
      const artifact = {
        language: match[1] || 'text',
        code: match[2].trim().replace(/X\r?\n?/g, ''), // Clean up the weird X
        filename: null,
        instanceId: metadata.instanceId,
        role: metadata.role,
        taskId: metadata.taskId
      };
      artifact.filename = this.inferFilename(artifact);
      artifacts.push(artifact);
    }

    return artifacts;
  }

  inferFilename(artifact) {
    const lines = artifact.code.split('\n').slice(0, 3);
    for (const line of lines) {
      const match = line.match(/(?:\/\/|#|<!--)\s*file:\s*([\w\-\.]+)/i);
      if (match) return match[1].trim();
    }

    // Heuristic: mapping language to extension
    const extMap = {
      javascript: 'js', js: 'js',
      typescript: 'ts', ts: 'ts',
      python: 'py', py: 'py',
      html: 'html', css: 'css',
      json: 'json', markdown: 'md', md: 'md',
      yaml: 'yaml', yml: 'yaml',
      bash: 'sh', sh: 'sh'
    };
    const ext = extMap[artifact.language.toLowerCase()] || 'txt';
    const hash = Math.random().toString(36).substring(2, 7);
    return `artifact-${hash}.${ext}`;
  }

  async saveAll(artifacts, outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = [];
    for (const artifact of artifacts) {
      let filename = artifact.filename;
      let filePath = path.join(outputDir, filename);
      
      let counter = 1;
      while (fs.existsSync(filePath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        filePath = path.join(outputDir, `${base}-${++counter}${ext}`);
      }

      fs.writeFileSync(filePath, artifact.code);
      results.push({
        filename: path.basename(filePath),
        path: filePath,
        language: artifact.language,
        written: true
      });
    }
    return results;
  }

  static fromDirectory(dir) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    return files.map(f => ({
      filename: f,
      path: path.join(dir, f),
      language: path.extname(f).slice(1)
    }));
  }
}