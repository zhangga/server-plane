import { spawn } from 'node:child_process';

export interface ComposeLogsCommand {
  projectName: string;
  composeFile: string;
  cwd: string;
  service: string;
  tail: number;
}

export type ComposeLogReader = (command: ComposeLogsCommand) => Promise<string>;

export const runDockerComposeLogs: ComposeLogReader = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'compose',
        '-p',
        command.projectName,
        '-f',
        command.composeFile,
        'logs',
        '--no-color',
        '--tail',
        String(command.tail),
        command.service,
      ],
      {
        cwd: command.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout || stderr);
        return;
      }
      reject(new Error(`docker compose logs failed with code ${code}: ${(stderr || stdout).trim()}`));
    });
  });
