import { describe, expect, it } from 'vitest';
import { describeModelEdit, HISTORY_LIMIT } from '../../../src/shared/history';
import type { ModelEdit } from '../../../src/dbt/edit';

describe('history descriptions', () => {
  it('describes every ModelEdit kind', () => {
    const fk = { to: "ref('customers')", columns: ['customer_id'], toColumns: ['id'], virtual: false };
    const edits: ModelEdit[] = [
      { kind: 'setModelName', model: 'orders', name: 'sales' },
      { kind: 'setModelDescription', model: 'orders', description: 'x' },
      { kind: 'setColumnName', model: 'orders', column: 'state', name: 'status' },
      { kind: 'setColumnDataType', model: 'orders', column: 'status', dataType: 'varchar' },
      { kind: 'setColumnDescription', model: 'orders', column: 'status', description: 'x' },
      { kind: 'setColumnMeta', model: 'orders', column: 'status', key: 'pii', value: 'yes' },
      { kind: 'setPrimaryKey', model: 'orders', columns: ['id'], virtual: false },
      { kind: 'setForeignKeyTarget', model: 'orders', fk, target: 'users' },
      { kind: 'setForeignKeyColumns', model: 'orders', fk, columns: ['x'], toColumns: ['y'] },
      { kind: 'setForeignKeyVirtual', model: 'orders', fk, virtual: true },
      { kind: 'createForeignKey', model: 'orders', target: 'users', columns: ['x'], toColumns: ['y'], virtual: true },
      { kind: 'removeForeignKey', model: 'orders', fk },
      { kind: 'transferColumns', sourceModel: 'orders', destinationModel: 'orders', columns: ['x'], copy: false },
      { kind: 'addColumn', model: 'orders', name: 'x', dataType: 'text' },
      { kind: 'applyAiPromptImport', model: 'orders', columns: [] },
    ];
    expect(edits.map(describeModelEdit)).toEqual([
      'Rename model orders to sales', 'Change model orders description',
      'Rename column orders.state to status', 'Change orders.status data type',
      'Change orders.status description', 'Change orders.status meta pii',
      'Change primary key on orders', 'Edit foreign key on orders',
      'Edit foreign key on orders', 'Edit foreign key on orders',
      'Create foreign key on orders', 'Delete foreign key on orders',
      'Reorder column in orders', 'Add column orders.x', 'Import AI changes for orders',
    ]);
  });

  it('sets retention to 50', () => expect(HISTORY_LIMIT).toBe(50));
});
