/** External process wrapper for private GitHub Release updates. */
import { mkdir } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { UPDATE_REPOSITORY, type LatestRelease } from '../shared/update';

const execFile = promisify(execFileCallback);

export async function fetchLatestRelease(): Promise<unknown> {
  const { stdout } = await execFile('gh', [
    'release', 'view', '--repo', UPDATE_REPOSITORY, '--json', 'tagName,url,assets',
  ]);
  return JSON.parse(stdout) as unknown;
}

export async function downloadRelease(release: LatestRelease, destinationDir: string): Promise<string> {
  await mkdir(destinationDir, { recursive: true });
  await execFile('gh', [
    'release', 'download', release.tagName, '--repo', UPDATE_REPOSITORY,
    '--pattern', release.assetName, '--dir', destinationDir, '--clobber',
  ]);
  return path.join(destinationDir, release.assetName);
}

export async function installVsix(vsixPath: string): Promise<void> {
  const args = ['--install-extension', vsixPath, '--force'];
  if (process.platform === 'win32') {
    await execFile('cmd.exe', ['/d', '/s', '/c', 'code.cmd', ...args]);
    return;
  }
  await execFile('code', args);
}
