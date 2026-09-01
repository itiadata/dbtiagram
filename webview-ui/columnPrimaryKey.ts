/**
 * Pure helpers for the details sidebar's Column-section "Primary key"
 * checkbox (spec 34): derive whether a column is currently part of its
 * table's displayed primary key, and derive the `setPrimaryKey` edit that
 * toggles its membership. Reuses the same defaults as `PrimaryKeySection`
 * (spec 08/33) so the two controls stay consistent.
 */
import type { ModelEdit } from '../src/dbt/edit';
import type { TableNode } from '../src/diagram/graph';

/** Whether `columnName` is part of the table's displayed primary key. */
export function isPrimaryKeyColumn(node: TableNode, columnName: string): boolean {
  return node.primaryKey?.columns.includes(columnName) ?? false;
}

/**
 * The `setPrimaryKey` edit that adds `columnName` to the table's primary key
 * when it is not a member, or removes it when it is.
 */
export function toggleColumnPrimaryKey(node: TableNode, columnName: string): ModelEdit {
  const columns = node.primaryKey?.columns ?? [];
  const virtual = node.primaryKey?.virtual ?? false;
  const uniqueTest = node.primaryKey?.uniqueTest ?? true;
  const isMember = columns.includes(columnName);
  const next = isMember ? columns.filter((c) => c !== columnName) : [...columns, columnName];
  return { kind: 'setPrimaryKey', model: node.id, columns: next, virtual, uniqueTest };
}
