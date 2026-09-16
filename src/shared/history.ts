import type { ModelEdit } from '../dbt/edit';

export type HistoryDomain = 'yaml' | 'layout';

export interface HistoryItem {
  id: number;
  label: string;
  domain: HistoryDomain;
}

export interface HistoryState {
  items: HistoryItem[];
  /** Number of retained actions currently applied; 0..items.length. */
  cursor: number;
  truncated: boolean;
}

export const HISTORY_LIMIT = 50;

export function describeModelEdit(edit: ModelEdit): string {
  switch (edit.kind) {
    case 'setModelName': return `Rename model ${edit.model} to ${edit.name}`;
    case 'setModelDescription': return `Change model ${edit.model} description`;
    case 'setColumnName': return `Rename column ${edit.model}.${edit.column} to ${edit.name}`;
    case 'setColumnDataType': return `Change ${edit.model}.${edit.column} data type`;
    case 'setColumnDescription': return `Change ${edit.model}.${edit.column} description`;
    case 'setColumnMeta': return `Change ${edit.model}.${edit.column} meta ${edit.key}`;
    case 'setPrimaryKey': return `Change primary key on ${edit.model}`;
    case 'setForeignKeyTarget':
    case 'setForeignKeyColumns':
    case 'setForeignKeyVirtual': return `Edit foreign key on ${edit.model}`;
    case 'createForeignKey': return `Create foreign key on ${edit.model}`;
    case 'removeForeignKey': return `Delete foreign key on ${edit.model}`;
    case 'transferColumns': {
      const noun = edit.columns.length === 1 ? 'column' : 'columns';
      if (edit.sourceModel === edit.destinationModel) return `Reorder ${noun} in ${edit.sourceModel}`;
      return `${edit.copy ? 'Copy' : 'Move'} ${noun} from ${edit.sourceModel} to ${edit.destinationModel}`;
    }
    case 'addColumn': return `Add column ${edit.model}.${edit.name}`;
    case 'applyAiPromptImport': return `Import AI changes for ${edit.model}`;
  }
}
