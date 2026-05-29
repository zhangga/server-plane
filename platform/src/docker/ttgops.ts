import { spawn } from 'node:child_process';

export type ImagePuller = (image: string) => Promise<void>;

export function createTtgopsImagePuller(opts: { binPath: string; configPath: string }): ImagePuller {
  return (image) =>
    new Promise((resolve, reject) => {
      const child = spawn(opts.binPath, ['-c', opts.configPath, 'icr', 'pull', image], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

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
        reject(new Error(`ttgops pull failed for ${image} with code ${code}: ${output.trim()}`));
      });
    });
}
