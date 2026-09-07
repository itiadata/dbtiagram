import { describe, expect, it, vi } from 'vitest';
import {
  decodeLatestRelease,
  isNewerVersion,
  runUpdateCheck,
  updateAvailableMessage,
  updateInstalledMessage,
  type UpdateHost,
} from '../../../src/shared/update';

const latest = {
  tagName: 'v0.0.3',
  url: 'https://github.com/itiadata/dbtiagram/releases/tag/v0.0.3',
  assets: [{ name: 'dbtiagram-0.0.3.vsix' }],
};

function host(overrides: Partial<UpdateHost> = {}): UpdateHost {
  return {
    installedVersion: '0.0.2',
    fetchLatestRelease: vi.fn(() => Promise.resolve(latest)),
    promptUpdate: vi.fn(() => Promise.resolve('Later')),
    download: vi.fn(() => Promise.resolve('C:\\store\\dbtiagram-0.0.3.vsix')),
    install: vi.fn(() => Promise.resolve()),
    promptReload: vi.fn(() => Promise.resolve('Later')),
    reload: vi.fn(() => Promise.resolve()),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('decodeLatestRelease', () => {
  it('decodes the designated latest release and exact VSIX', () => {
    expect(decodeLatestRelease(latest)).toEqual({
      tagName: 'v0.0.3',
      version: '0.0.3',
      url: 'https://github.com/itiadata/dbtiagram/releases/tag/v0.0.3',
      assetName: 'dbtiagram-0.0.3.vsix',
    });
  });

  it('accepts a release tag without v', () => {
    expect(decodeLatestRelease({ ...latest, tagName: '0.0.3' }).version).toBe('0.0.3');
  });

  it('rejects malformed or unusable latest releases', () => {
    expect(() => decodeLatestRelease({})).toThrowError();
    expect(() => decodeLatestRelease({ ...latest, tagName: 'latest' })).toThrowError();
    expect(() => decodeLatestRelease({ ...latest, assets: [] })).toThrowError();
    expect(() => decodeLatestRelease({ ...latest, assets: [latest.assets[0], latest.assets[0]] })).toThrowError();
  });
});

describe('isNewerVersion', () => {
  it('compares versions numerically', () => {
    expect(isNewerVersion('0.0.3', '0.0.2')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('0.0.2', '0.0.3')).toBe(false);
  });
});

describe('update messages', () => {
  it('uses the literal prompt messages', () => {
    expect(updateAvailableMessage('0.0.3', '0.0.2')).toBe(
      'dbt Diagram v0.0.3 is available (installed: v0.0.2).',
    );
    expect(updateInstalledMessage('0.0.3')).toBe(
      'dbt Diagram v0.0.3 was installed. Reload VS Code to use it.',
    );
  });
});

describe('runUpdateCheck', () => {
  it('downloads installs and reloads an accepted update', async () => {
    const value = host({ promptUpdate: vi.fn(() => Promise.resolve('Update')), promptReload: vi.fn(() => Promise.resolve('Reload Now')) });
    await runUpdateCheck(value);

    expect(value.fetchLatestRelease).toHaveBeenCalledOnce();
    expect(value.download).toHaveBeenCalledWith(decodeLatestRelease(latest));
    expect(value.install).toHaveBeenCalledWith('C:\\store\\dbtiagram-0.0.3.vsix');
    expect(value.reload).toHaveBeenCalledOnce();
    expect(value.warn).not.toHaveBeenCalled();
  });

  it.each(['Later', undefined] as const)('postpones the update with %s', async (choice) => {
    const value = host({ promptUpdate: vi.fn(() => Promise.resolve(choice)) });
    await runUpdateCheck(value);
    expect(value.download).not.toHaveBeenCalled();
    expect(value.install).not.toHaveBeenCalled();
    expect(value.promptReload).not.toHaveBeenCalled();
    expect(value.reload).not.toHaveBeenCalled();
    expect(value.warn).not.toHaveBeenCalled();
  });

  it.each(['Later', undefined] as const)('postpones reload with %s', async (choice) => {
    const value = host({ promptUpdate: vi.fn(() => Promise.resolve('Update')), promptReload: vi.fn(() => Promise.resolve(choice)) });
    await runUpdateCheck(value);
    expect(value.download).toHaveBeenCalledOnce();
    expect(value.install).toHaveBeenCalledOnce();
    expect(value.reload).not.toHaveBeenCalled();
  });

  it.each(['0.0.3', '0.0.2'])('does nothing for latest %s when installed version is 0.0.3', async (tagName) => {
    const value = host({
      installedVersion: '0.0.3',
      fetchLatestRelease: vi.fn(() => Promise.resolve({
        ...latest,
        tagName,
        assets: [{ name: `dbtiagram-${tagName}.vsix` }],
      })),
    });
    await runUpdateCheck(value);
    expect(value.promptUpdate).not.toHaveBeenCalled();
    expect(value.download).not.toHaveBeenCalled();
    expect(value.warn).not.toHaveBeenCalled();
  });

  it('warns when checking fails', async () => {
    const value = host({ fetchLatestRelease: vi.fn(() => Promise.reject(new Error('gh not found'))) });
    await runUpdateCheck(value);
    expect(value.warn).toHaveBeenCalledWith('dbt Diagram could not check for updates: gh not found');
  });

  it('warns when download fails', async () => {
    const value = host({ promptUpdate: vi.fn(() => Promise.resolve('Update')), download: vi.fn(() => Promise.reject(new Error('network error'))) });
    await runUpdateCheck(value);
    expect(value.warn).toHaveBeenCalledWith('dbt Diagram could not install v0.0.3: network error');
    expect(value.install).not.toHaveBeenCalled();
  });

  it('reports the VSIX path when installation fails', async () => {
    const value = host({ promptUpdate: vi.fn(() => Promise.resolve('Update')), install: vi.fn(() => Promise.reject(new Error('code not found'))) });
    await runUpdateCheck(value);
    expect(value.warn).toHaveBeenCalledWith(
      'dbt Diagram could not install v0.0.3: code not found Downloaded VSIX: C:\\store\\dbtiagram-0.0.3.vsix',
    );
    expect(value.reload).not.toHaveBeenCalled();
  });
});
