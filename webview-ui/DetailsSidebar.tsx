/**
 * Right details sidebar of the diagram webview (spec 06): shows the editable
 * properties of whatever is selected — the table's name and description, or
 * the column's name, data type, and description — and an empty state when
 * nothing is selected.
 *
 * Fields are rendered by `EditableField` (label + input/textarea): a local
 * draft seeded from the graph value, reset when the value changes; commit on
 * blur/Enter via `onCommit` only when the draft differs; Escape reverts; a
 * blank name reverts locally instead of committing. Descriptions/data types
 * are single plain fields; a blank value clears the YAML key (the pure
 * `applyEdit` turns it into `undefined`).
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import type { ModelEdit } from '../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../src/dbt/types';
import type { TableNode, TableNodeColumn } from '../src/diagram/graph';
import { ForeignKeySection, type DraftForeignKey } from './ForeignKeySection';
import { PrimaryKeySection } from './PrimaryKeySection';

/** The entity the sidebar renders: a table, or a column within its table. */
export type SelectedEntity =
  | { kind: 'table'; node: TableNode }
  | { kind: 'column'; node: TableNode; column: TableNodeColumn };

interface DetailsSidebarProps {
  entity: SelectedEntity | null;
  /** Full graph nodes, so the FK editor can list workspace models (spec 08). */
  nodes: TableNode[];
  /** FK focused by double-clicking its edge (spec 08); null when none. */
  focusedFk: ForeignKeyDescriptor | null;
  /** Local draft FKs for the selected table (webview memory only, spec 09 merged). */
  drafts: DraftForeignKey[];
  onEdit: (edit: ModelEdit) => void;
  onAddDraft: (target: string) => void;
  onRemoveDraft: (draftId: string) => void;
  onDraftVirtualChange: (draftId: string, virtual: boolean) => void;
  onDraftAddPair: (draft: DraftForeignKey, source: string, target: string) => void;
  onRemoveLastPair: (fk: ForeignKeyDescriptor) => void;
  /** Hides the whole sidebar, leaving its reopen rail (spec 11). */
  onCollapse: () => void;
  /** Inline width from the App's resize state (spec 11). */
  style?: CSSProperties;
}

export function DetailsSidebar({
  entity,
  nodes,
  focusedFk,
  drafts,
  onEdit,
  onAddDraft,
  onRemoveDraft,
  onDraftVirtualChange,
  onDraftAddPair,
  onRemoveLastPair,
  onCollapse,
  style,
}: DetailsSidebarProps): JSX.Element {
  return (
    <aside className="details" style={style}>
      <div className="details__header">
        <span className="details__header-title">Properties</span>
        <button
          type="button"
          className="sidebar__collapse"
          title="Hide sidebar"
          aria-label="Hide sidebar"
          onClick={onCollapse}
        >
          <span className="sidebar__chevron sidebar__chevron--flip" aria-hidden="true" />
        </button>
      </div>
      {entity === null ? (
        <p className="details__empty">Select a table or a column to edit its properties.</p>
      ) : entity.kind === 'table' ? (
        <div className="details__section">
          <h2 className="details__section-title">Table</h2>
          <EditableField
            label="Name"
            value={entity.node.label}
            required
            onCommit={(value) =>
              onEdit({ kind: 'setModelName', model: entity.node.id, name: value })
            }
          />
          <EditableField
            label="Description"
            value={entity.node.description ?? ''}
            multiline
            onCommit={(value) =>
              onEdit({
                kind: 'setModelDescription',
                model: entity.node.id,
                description: value,
              })
            }
          />
          <PrimaryKeySection node={entity.node} onEdit={onEdit} />
          <ForeignKeySection
            node={entity.node}
            nodes={nodes}
            focusedFk={focusedFk}
            drafts={drafts}
            onEdit={onEdit}
            onAddDraft={onAddDraft}
            onRemoveDraft={onRemoveDraft}
            onDraftVirtualChange={onDraftVirtualChange}
            onDraftAddPair={onDraftAddPair}
            onRemoveLastPair={onRemoveLastPair}
          />
        </div>
      ) : (
        <div className="details__section">
          <h2 className="details__section-title">Column</h2>
          <p className="details__context">
            {entity.node.id}.{entity.column.name}
          </p>
          <EditableField
            label="Name"
            value={entity.column.name}
            required
            onCommit={(value) =>
              onEdit({
                kind: 'setColumnName',
                model: entity.node.id,
                column: entity.column.name,
                name: value,
              })
            }
          />
          <EditableField
            label="Data type"
            value={entity.column.dataType ?? ''}
            onCommit={(value) =>
              onEdit({
                kind: 'setColumnDataType',
                model: entity.node.id,
                column: entity.column.name,
                dataType: value,
              })
            }
          />
          <EditableField
            label="Description"
            value={entity.column.description ?? ''}
            multiline
            onCommit={(value) =>
              onEdit({
                kind: 'setColumnDescription',
                model: entity.node.id,
                column: entity.column.name,
                description: value,
              })
            }
          />
        </div>
      )}
    </aside>
  );
}

interface EditableFieldProps {
  label: string;
  value: string;
  /** Blank drafts revert locally instead of committing (names must not be empty). */
  required?: boolean;
  /** Renders a textarea; Enter inserts a newline instead of committing. */
  multiline?: boolean;
  onCommit: (value: string) => void;
}

function EditableField({
  label,
  value,
  required,
  multiline,
  onCommit,
}: EditableFieldProps): JSX.Element {
  const [draft, setDraft] = useState(value);
  // Guards the focus->commit session against double commits (Escape then the
  // blur that follows it); reset whenever the graph value changes so later
  // edits still commit.
  const finishedRef = useRef(false);

  // A diagram:update that changed this field's value resets the draft; other
  // updates leave it alone.
  useEffect(() => {
    setDraft(value);
    finishedRef.current = false;
  }, [value]);

  const finish = (commit: boolean): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (!commit) {
      setDraft(value);
      finishedRef.current = false;
      return;
    }
    if (required && draft.trim().length === 0) {
      setDraft(value);
      finishedRef.current = false;
      return;
    }
    if (draft === value) {
      finishedRef.current = false;
      return;
    }
    onCommit(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      finish(false);
    } else if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      finish(true);
    }
  };

  const commonProps = {
    className: multiline ? 'details__textarea' : 'details__input',
    value: draft,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
      setDraft(event.target.value),
    onKeyDown,
    onBlur: (): void => finish(true),
  };

  return (
    <label className="details__field">
      <span className="details__label">{label}</span>
      {multiline ? <textarea {...commonProps} rows={3} /> : <input {...commonProps} />}
    </label>
  );
}
