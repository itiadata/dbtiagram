/**
 * The `ModelEdit` union: every mutation the webview can request. Pure types —
 * MUST NOT import `vscode`.
 *
 * Since spec 06 the funnel carries property edits only (model/column names,
 * descriptions, data types); spec 08 adds primary-key and foreign-key edits.
 * `addColumn` was removed with the Add-column form; adding columns returns as
 * its own feature later.
 */
import type { ForeignKeyDescriptor } from '../types';

export type ModelEdit =
  | { kind: 'setModelName'; model: string; name: string }
  | { kind: 'setModelDescription'; model: string; description: string }
  | { kind: 'setColumnName'; model: string; column: string; name: string }
  | { kind: 'setColumnDataType'; model: string; column: string; dataType: string }
  | { kind: 'setColumnDescription'; model: string; column: string; description: string }
  | { kind: 'setColumnMeta'; model: string; column: string; key: string; value: string }
  | { kind: 'setPrimaryKey'; model: string; columns: string[]; virtual: boolean }
  | { kind: 'setForeignKeyTarget'; model: string; fk: ForeignKeyDescriptor; target: string }
  | {
      kind: 'setForeignKeyColumns';
      model: string;
      fk: ForeignKeyDescriptor;
      columns: string[];
      toColumns: string[];
    }
  | { kind: 'setForeignKeyVirtual'; model: string; fk: ForeignKeyDescriptor; virtual: boolean }
  | {
      kind: 'createForeignKey';
      model: string;
      target: string;
      columns: string[];
      toColumns: string[];
      virtual: boolean;
    }
  | { kind: 'removeForeignKey'; model: string; fk: ForeignKeyDescriptor };
