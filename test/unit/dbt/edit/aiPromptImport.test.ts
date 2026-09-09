import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../../../src/dbt/edit';
import type { ModelDefinition } from '../../../../src/dbt/types';

describe('applyAiPromptImport', () => {
  it('applies accepted names types and FK references together', () => {
    const models: ModelDefinition[] = [{ name: 'orders', columns: [{ name: 'id', dataType: 'TEXT', meta: { source_name: 'id' } }] }, { name: 'items', constraints: [{ type: 'foreign_key', columns: ['order_id'], to: "ref('orders')", toColumns: ['id'] }] }];
    const result = applyEdit(models, { kind: 'applyAiPromptImport', model: 'orders', columns: [{ sourceName: 'id', newName: 'ID_ORDER', dataType: 'INTEGER' }] });
    expect(result.models[0].columns).toMatchObject([{ name: 'ID_ORDER', dataType: 'INTEGER' }]);
    expect(result.models[1].constraints?.[0].toColumns).toEqual(['ID_ORDER']);
  });
});
