import { describe, expect, it } from 'vitest';
import { externalEntityId, modelEntityId, parseDiagramEntityId, sourceEntityId } from '../../../src/shared/entityId';

describe('diagram entity ids', () => {
  it('keeps colliding entities distinct', () => {
    expect([modelEntityId('sample', 'transactions'), sourceEntityId('finops', 'transactions'), externalEntityId('pkg', 'transactions')]).toEqual([
      'model:sample:transactions', 'source:finops:transactions', 'external:pkg:transactions',
    ]);
  });
  it('parses each namespaced entity kind', () => {
    expect(parseDiagramEntityId('model:sample:orders')).toEqual({ kind: 'model', packageName: 'sample', name: 'orders' });
    expect(parseDiagramEntityId('source:finops:transactions')).toEqual({ kind: 'source', sourceName: 'finops', tableName: 'transactions' });
    expect(parseDiagramEntityId('external:pkg:orders')).toEqual({ kind: 'external', packageName: 'pkg', name: 'orders' });
  });
  it('rejects ambiguous components', () => {
    expect(() => modelEntityId('', 'orders')).toThrow();
    expect(() => sourceEntityId('fin:ops', 'orders')).toThrow();
    expect(parseDiagramEntityId('model:sample:bad:name')).toBeNull();
  });
});
