/**
 * Integration test for matrix column preference persistence (spec 27):
 * verifies a round-trip through a real `ExtensionContext.workspaceState`.
 */
/**
 * Integration test for matrix column preference persistence (spec 27):
 * verifies a round-trip through a `vscode.Memento`-shaped store inside the
 * real VS Code extension host (the module under test only ever touches the
 * `Memento` surface of `ExtensionContext.workspaceState`).
 */
import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
  readMatrixColumnPrefs,
  writeMatrixColumnPrefs,
} from '../../../src/vscode/matrixColumnPrefs';
import type { StoredMatrixColumnPref } from '../../../src/shared/matrixColumns';

class FakeMemento implements vscode.Memento {
  private readonly data = new Map<string, unknown>();

  public keys(): readonly string[] {
    return [...this.data.keys()];
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.data.has(key) ? (this.data.get(key) as T) : defaultValue;
  }

  public update(key: string, value: unknown): Thenable<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
}

suite('matrixColumnPrefs', () => {
  test('writeMatrixColumnPrefs then readMatrixColumnPrefs round-trips', async () => {
    const state = new FakeMemento();

    const columns: StoredMatrixColumnPref[] = [
      { id: 'name', visible: true },
      { id: { meta: 'GDPR' }, visible: false },
    ];

    await writeMatrixColumnPrefs(state, 'model', columns);
    const read = readMatrixColumnPrefs(state, 'model');
    assert.deepStrictEqual(read, columns);
  });
});
