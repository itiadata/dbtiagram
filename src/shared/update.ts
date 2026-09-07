/** Private GitHub Release update decisions. This module is pure and has no VS Code dependency. */
export const UPDATE_REPOSITORY = 'itiadata/dbtiagram';

export interface LatestRelease {
  tagName: string;
  version: string;
  url: string;
  assetName: string;
}

export interface UpdateHost {
  readonly installedVersion: string;
  fetchLatestRelease(): Promise<unknown>;
  promptUpdate(message: string): Promise<'Update' | 'Later' | undefined>;
  download(release: LatestRelease): Promise<string>;
  install(vsixPath: string): Promise<void>;
  promptReload(message: string): Promise<'Reload Now' | 'Later' | undefined>;
  reload(): Promise<void>;
  warn(message: string): void;
}

export type UpdateCheckOutcome = 'upToDate' | 'updateAvailable' | 'checkFailed';

const VERSION = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/;

export function decodeLatestRelease(value: unknown): LatestRelease {
  if (!isRecord(value) || typeof value.tagName !== 'string' || typeof value.url !== 'string') {
    throw new Error('Latest release metadata is invalid');
  }
  const version = normalizedVersion(value.tagName);
  if (version === null) throw new Error(`Latest release tag "${value.tagName}" is not a stable X.Y.Z version`);
  if (!Array.isArray(value.assets)) throw new Error('Latest release assets are invalid');

  const assetName = `dbtiagram-${version}.vsix`;
  const matches = value.assets.filter((asset) => isRecord(asset) && asset.name === assetName);
  if (matches.length !== 1) throw new Error(`Latest release must contain exactly one ${assetName}`);
  return { tagName: value.tagName, version, url: value.url, assetName };
}

export function isNewerVersion(candidate: string, installed: string): boolean {
  const candidateParts = versionParts(candidate);
  const installedParts = versionParts(installed);
  if (candidateParts === null || installedParts === null) {
    throw new Error('Extension versions must be stable X.Y.Z versions');
  }
  for (let index = 0; index < candidateParts.length; index += 1) {
    const candidatePart = candidateParts[index];
    const installedPart = installedParts[index];
    if (candidatePart !== installedPart) return candidatePart > installedPart;
  }
  return false;
}

export function updateAvailableMessage(candidate: string, installed: string): string {
  return `dbt Diagram v${candidate} is available (installed: v${installed}).`;
}

export function updateInstalledMessage(version: string): string {
  return `dbt Diagram v${version} was installed. Reload VS Code to use it.`;
}

export async function runUpdateCheck(host: UpdateHost): Promise<UpdateCheckOutcome> {
  let release: LatestRelease;
  try {
    release = decodeLatestRelease(await host.fetchLatestRelease());
    if (!isNewerVersion(release.version, host.installedVersion)) return 'upToDate';
  } catch (error) {
    host.warn(`dbt Diagram could not check for updates: ${errorMessage(error)}`);
    return 'checkFailed';
  }

  if ((await host.promptUpdate(updateAvailableMessage(release.version, host.installedVersion))) !== 'Update') {
    return 'updateAvailable';
  }

  let vsixPath: string | undefined;
  try {
    vsixPath = await host.download(release);
    await host.install(vsixPath);
  } catch (error) {
    const pathNote = vsixPath === undefined ? '' : ` Downloaded VSIX: ${vsixPath}`;
    host.warn(`dbt Diagram could not install v${release.version}: ${errorMessage(error)}${pathNote}`);
    return 'updateAvailable';
  }

  if ((await host.promptReload(updateInstalledMessage(release.version))) === 'Reload Now') {
    await host.reload();
  }
  return 'updateAvailable';
}

function versionParts(value: string): number[] | null {
  const match = VERSION.exec(value);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function normalizedVersion(value: string): string | null {
  const parts = versionParts(value);
  return parts === null ? null : parts.join('.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
