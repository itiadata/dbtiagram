import { describe, expect, it, vi } from 'vitest';
import { runSourceImport, type SourceImportHost } from '../../../src/webview/sourceImport';

function host(overrides: Partial<SourceImportHost> = {}): SourceImportHost {
  return {
    loadSources: () => Promise.resolve([{ uri: '/sources.yml', label: 'sources.yml', file: { sources: [{ name: 'finops', tables: [{ name: 'costs' }, { name: 'workspaces' }] }] } }]),
    modelFiles: () => [{ uri: '/models.yml', label: 'models.yml', file: { models: [] } }],
    workspaceModels: () => [],
    pick: vi.fn(() => Promise.resolve({ sourceUri: '/sources.yml', tableIds: ['finops.workspaces', 'finops.costs'], destinationUri: '/models.yml' })),
    writeDestination: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('runSourceImport', () => {
  it('runs the three-step import and writes once', async () => {
    const testHost = host();
    const report = await runSourceImport(testHost);
    expect(testHost.pick).toHaveBeenCalledWith(
      [{ uri: '/sources.yml', label: 'sources.yml', entities: ['finops.costs', 'finops.workspaces'] }],
      [{ uri: '/models.yml', label: 'models.yml', entities: [] }],
    );
    expect(testHost.writeDestination).toHaveBeenCalledTimes(1);
    expect(report?.importedModels).toEqual(['costs_from_source', 'workspaces_from_source']);
  });

  it('returns without writing when selection is cancelled', async () => {
    const testHost = host({ pick: () => Promise.resolve(undefined) });
    expect(await runSourceImport(testHost)).toBeUndefined();
    expect(testHost.writeDestination).not.toHaveBeenCalled();
  });

  it('rejects a stale selected table', async () => {
    const testHost = host({ pick: () => Promise.resolve({ sourceUri: '/sources.yml', tableIds: ['finops.missing'], destinationUri: '/models.yml' }) });
    await expect(runSourceImport(testHost)).rejects.toThrow('Source table "finops.missing" is no longer available.');
    expect(testHost.writeDestination).not.toHaveBeenCalled();
  });
});
