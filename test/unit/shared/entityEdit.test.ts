import { describe, expect, it } from 'vitest';
import { routeDiagramEdit } from '../../../src/shared/entityEdit';

describe('routeDiagramEdit', () => {
  it('routes model and source edits', () => {
    expect(routeDiagramEdit({ kind: 'setModelDescription', model: 'model:sample:orders', description: 'x' })).toEqual({ domain: 'model', edit: { kind: 'setModelDescription', model: 'orders', description: 'x' } });
    expect(routeDiagramEdit({ kind: 'setColumnDescription', model: 'source:finops:transactions', column: 'id', description: 'x' })).toEqual({ domain: 'source', edit: { kind: 'setColumnDescription', model: 'finops.transactions', column: 'id', description: 'x' } });
  });
  it('rejects cross-domain edits', () => {
    expect(() => routeDiagramEdit({ kind: 'createForeignKey', model: 'model:sample:orders', target: 'source:finops:transactions', columns: ['id'], toColumns: ['id'], virtual: true })).toThrow('Cannot edit across diagram entity domains');
    expect(() => routeDiagramEdit({ kind: 'setModelDescription', model: 'external:pkg:orders', description: 'x' })).toThrow('Cannot edit across diagram entity domains');
  });
});
