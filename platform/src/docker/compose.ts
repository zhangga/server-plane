import { spawn } from 'node:child_process';

export interface ComposeCommand {
  projectName: string;
  composeFile: string;
  cwd: string;
  args: string[];
}

export type ComposeRunner = (command: ComposeCommand) => Promise<void>;

export const runDockerCompose: ComposeRunner = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['compose', '-p', command.projectName, '-f', command.composeFile, ...command.args],
      {
        cwd: command.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`docker compose ${command.args.join(' ')} failed with code ${code}: ${output.trim()}`));
    });
  });
