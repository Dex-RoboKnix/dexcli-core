import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const prompt = '\x1b[32mgemini>\x1b[0m ';

process.stdout.write(prompt);

rl.on('line', (line) => {
  if (line.trim() === 'exit') {
    process.exit(0);
  }
  
  process.stdout.write(`Mock response to: ${line}\n`);
  process.stdout.write('```javascript\n');
  process.stdout.write('// file: mock-output.js\n');
  process.stdout.write('console.log("mock artifact");\n');
  process.stdout.write('```\n');
  process.stdout.write(prompt);
});