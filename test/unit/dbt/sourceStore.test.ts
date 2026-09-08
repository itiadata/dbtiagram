import { expect, it } from 'vitest';
import { applySourceTextChange, createSourceStore, distributeEditedSources } from '../../../src/dbt/sourceStore';
import { parseSourceYml } from '../../../src/dbt/sourceParse';
const good = 'sources:\n  - name: a\n    tables:\n      - name: x\n';
it('keeps last good source data on malformed edits', () => {
  const store = applySourceTextChange(createSourceStore(), 'a.yml', good);
  const broken = applySourceTextChange(store, 'a.yml', 'sources: [');
  expect(broken.records).toEqual(store.records); expect(broken.pendingErrors.has('a.yml')).toBe(true);
});
it('silently drops a file changed to model mode', () => expect(applySourceTextChange(applySourceTextChange(createSourceStore(), 'a.yml', good), 'a.yml', 'models: []').records).toEqual([]));
it('redistributes a qualified table edit to its file', () => {
  const a = parseSourceYml(good); const b = parseSourceYml(good.replace('name: a', 'name: b'));
  const store = createSourceStore([{ uri: 'a', file: a }, { uri: 'b', file: b }]);
  const edited = [...a.sources, { ...b.sources[0], tables: [{ ...b.sources[0].tables[0], description: 'new' }] }];
  expect(distributeEditedSources(store, edited).map((record) => record.uri)).toEqual(['b']);
});
