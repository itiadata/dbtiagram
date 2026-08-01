/**
 * Foreign keys section of the details sidebar table view (spec 08, spec 09
 * merged).
 *
 * One card per FK descriptor (`node.foreignKeys` — real constraints first,
 * then virtual meta entries), followed by one card per local draft
 * (`drafts`): a target model picker, a **Virtual** checkbox, the source →
 * target column pairs (each reassignable/removable), an **Add pair** control,
 * and a **Remove FK** button.
 *
 * Spec 09 merged: **Add foreign key** no longer posts an edit — it appends a
 * local draft (webview memory only). A draft card shows a marker + note and
 * its "+ Add pair" persists the FK atomically with its first pair via
 * `createForeignKey`. Removing the last pair of a persisted FK deletes it
 * from the file (`removeForeignKey`) and keeps a draft card so the user can
 * continue or abandon. The Virtual checkbox is disabled on zero-pair file FKs
 * (the pure layer rejects converting them). Every persisted change posts
 * exactly one edit through the existing `diagram:edit` funnel.
 *
 * The card matching `focusedFk` (by content) is highlighted and scrolled into
 * view — set by double-clicking an FK edge in the diagram.
 */
import { useEffect, useRef } from 'react';
import type { ModelEdit } from '../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../src/dbt/types';
import type { TableNode } from '../src/diagram/graph';
import { SearchSelect } from './SearchSelect';

/** Content match of two FK descriptors (to/columns/toColumns, spec 08 (d)). */
export function sameFkContent(a: ForeignKeyDescriptor, b: ForeignKeyDescriptor): boolean {
  return (
    a.to === b.to &&
    a.columns.length === b.columns.length &&
    a.columns.every((value, index) => value === b.columns[index]) &&
    a.toColumns.length === b.toColumns.length &&
    a.toColumns.every((value, index) => value === b.toColumns[index])
  );
}

/**
 * A webview-only FK under construction (spec 09 merged): nothing about it
 * exists in model.yml until its first column pair is added.
 */
export interface DraftForeignKey {
  /** Local, stable key (e.g. an incrementing counter) — never persisted. */
  draftId: string;
  target: string;
  virtual: boolean;
  /** Always empty while a draft. */
  columns: string[];
  /** Always empty while a draft. */
  toColumns: string[];
}

interface ForeignKeySectionProps {
  node: TableNode;
  nodes: TableNode[];
  focusedFk: ForeignKeyDescriptor | null;
  /** Local draft FKs for this node (webview memory only). */
  drafts: DraftForeignKey[];
  onEdit: (edit: ModelEdit) => void;
  /** Add foreign key pick: creates a local draft (no file write). */
  onAddDraft: (target: string) => void;
  onRemoveDraft: (draftId: string) => void;
  onDraftVirtualChange: (draftId: string, virtual: boolean) => void;
  /** Draft "+ Add pair": persists the FK with its first pair, drops the draft. */
  onDraftAddPair: (draft: DraftForeignKey, source: string, target: string) => void;
  /** Removing the last pair of a persisted FK: deletes it + keeps a draft. */
  onRemoveLastPair: (fk: ForeignKeyDescriptor) => void;
}

export function ForeignKeySection({
  node,
  nodes,
  focusedFk,
  drafts,
  onEdit,
  onAddDraft,
  onRemoveDraft,
  onDraftVirtualChange,
  onDraftAddPair,
  onRemoveLastPair,
}: ForeignKeySectionProps): JSX.Element {
  const modelNames = nodes.map((n) => n.id).sort();
  const foreignKeys = node.foreignKeys;

  return (
    <section className="details__sub-section">
      <h3 className="details__sub-section-title">Foreign keys</h3>
      {foreignKeys.length === 0 && drafts.length === 0 && (
        <p className="details__note">No foreign keys</p>
      )}
      <div className="fk-list">
        {foreignKeys.map((fk, index) => (
          <FkCard
            key={index}
            fk={fk}
            node={node}
            nodes={nodes}
            modelNames={modelNames}
            focused={focusedFk !== null && sameFkContent(focusedFk, fk)}
            onEdit={onEdit}
            onRemoveLastPair={onRemoveLastPair}
          />
        ))}
        {drafts.map((draft) => (
          <DraftFkCard
            key={draft.draftId}
            draft={draft}
            node={node}
            nodes={nodes}
            onRemove={onRemoveDraft}
            onVirtualChange={onDraftVirtualChange}
            onAddPair={onDraftAddPair}
          />
        ))}
      </div>
      <SearchSelect
        options={modelNames}
        value={null}
        placeholder="Add foreign key…"
        disabled={modelNames.length === 0}
        onSelect={onAddDraft}
      />
    </section>
  );
}

interface FkCardProps {
  fk: ForeignKeyDescriptor;
  node: TableNode;
  nodes: TableNode[];
  modelNames: string[];
  focused: boolean;
  onEdit: (edit: ModelEdit) => void;
  onRemoveLastPair: (fk: ForeignKeyDescriptor) => void;
}

function FkCard({ fk, node, nodes, modelNames, focused, onEdit, onRemoveLastPair }: FkCardProps): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const wasFocusedRef = useRef(false);

  // Scroll the card into view when the focus lands on it (mount after an edge
  // double-click, or focus moving between cards) — spec 08, section 10.
  useEffect(() => {
    if (focused && !wasFocusedRef.current && cardRef.current !== null) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    wasFocusedRef.current = focused;
  }, [focused]);

  const targetNode = fk.target === undefined ? undefined : nodes.find((n) => n.id === fk.target);
  const sourceColumns = node.columns.map((c) => c.name);
  const targetColumns = (targetNode?.columns ?? []).map((c) => c.name);

  // Spec 09 merged: a zero-pair file FK (legacy hand-written YAML) cannot be
  // converted between storages — the pure layer rejects it, so the checkbox
  // is disabled. It also renders the draft note (it is an incomplete FK).
  const isZeroPair = fk.columns.length === 0 && fk.toColumns.length === 0;

  const setTarget = (target: string): void => {
    onEdit({ kind: 'setForeignKeyTarget', model: node.id, fk, target });
  };

  const toggleVirtual = (): void => {
    onEdit({ kind: 'setForeignKeyVirtual', model: node.id, fk, virtual: !fk.virtual });
  };

  const remove = (): void => {
    onEdit({ kind: 'removeForeignKey', model: node.id, fk });
  };

  const changeSource = (index: number, nextSource: string): void => {
    const columns = [...fk.columns];
    columns[index] = nextSource;
    onEdit({
      kind: 'setForeignKeyColumns',
      model: node.id,
      fk,
      columns,
      toColumns: [...fk.toColumns],
    });
  };

  const changeTarget = (index: number, nextTarget: string): void => {
    const toColumns = [...fk.toColumns];
    toColumns[index] = nextTarget;
    onEdit({
      kind: 'setForeignKeyColumns',
      model: node.id,
      fk,
      columns: [...fk.columns],
      toColumns,
    });
  };

  const removePair = (index: number): void => {
    if (fk.columns.length === 1) {
      // Removing the last pair deletes the FK from the file; the webview keeps
      // a draft card so the user can continue or abandon (spec 09 merged).
      onRemoveLastPair(fk);
      return;
    }
    onEdit({
      kind: 'setForeignKeyColumns',
      model: node.id,
      fk,
      columns: fk.columns.filter((_, i) => i !== index),
      toColumns: fk.toColumns.filter((_, i) => i !== index),
    });
  };

  const usedSources = new Set(fk.columns);

  // The next addable pair: an unmapped source column, paired with the same
  // column name on the target when free, else the first free target column.
  // The Add pair button is disabled while no such pair exists (e.g. the FK
  // target is unparseable — `targetNode` is undefined — or every source is
  // already mapped) — spec 08.
  const nextPair = (): { source: string; target: string } | null => {
    if (targetNode === undefined) return null;
    const nextSource = sourceColumns.find((name) => !usedSources.has(name));
    if (nextSource === undefined) return null;
    const usedTargets = new Set(fk.toColumns);
    if (!usedTargets.has(nextSource) && targetColumns.includes(nextSource)) {
      return { source: nextSource, target: nextSource };
    }
    const nextTarget = targetColumns.find((name) => !usedTargets.has(name));
    return nextTarget === undefined ? null : { source: nextSource, target: nextTarget };
  };

  const pair = nextPair();
  const addPairDisabled = pair === null;

  const addPair = (): void => {
    if (pair === null) return;
    onEdit({
      kind: 'setForeignKeyColumns',
      model: node.id,
      fk,
      columns: [...fk.columns, pair.source],
      toColumns: [...fk.toColumns, pair.target],
    });
  };

  return (
    <div ref={cardRef} className={`fk-card${focused ? ' fk-card--focused' : ''}`}>
      <div className="fk-card__header">
        <div className="fk-card__target">
          <SearchSelect
            options={modelNames}
            value={fk.target ?? null}
            placeholder="target model…"
            onSelect={setTarget}
          />
        </div>
        <label className="details__checkbox-row">
          <input
            type="checkbox"
            checked={fk.virtual}
            disabled={isZeroPair}
            onChange={toggleVirtual}
          />
          Virtual
        </label>
        <button type="button" className="fk-card__remove" onClick={remove}>
          Remove
        </button>
      </div>
      {isZeroPair && (
        <p className="fk-card__draft-note">Draft — add a column pair to create this FK</p>
      )}
      {fk.columns.map((source, index) => (
        <div key={index} className="fk-pair">
          <div className="fk-pair__select">
            <SearchSelect options={sourceColumns} value={source} onSelect={(v) => changeSource(index, v)} />
          </div>
          <span className="fk-pair__arrow">→</span>
          <div className="fk-pair__select">
            <SearchSelect
              options={targetColumns}
              value={fk.toColumns[index] ?? null}
              placeholder="target column"
              disabled={targetNode === undefined}
              onSelect={(v) => changeTarget(index, v)}
            />
          </div>
          <button
            type="button"
            className="fk-pair__remove"
            aria-label="Remove column pair"
            onClick={() => removePair(index)}
          >
            ×
          </button>
        </div>
      ))}
      {sourceColumns.length > 0 && (
        <button
          type="button"
          className="fk-card__add-pair"
          disabled={addPairDisabled}
          onClick={addPair}
        >
          + Add pair
        </button>
      )}
    </div>
  );
}

interface DraftFkCardProps {
  draft: DraftForeignKey;
  node: TableNode;
  nodes: TableNode[];
  onRemove: (draftId: string) => void;
  onVirtualChange: (draftId: string, virtual: boolean) => void;
  onAddPair: (draft: DraftForeignKey, source: string, target: string) => void;
}

function DraftFkCard({
  draft,
  node,
  nodes,
  onRemove,
  onVirtualChange,
  onAddPair,
}: DraftFkCardProps): JSX.Element {
  const targetNode = nodes.find((n) => n.id === draft.target);
  const sourceColumns = node.columns.map((c) => c.name);
  const targetColumns = (targetNode?.columns ?? []).map((c) => c.name);

  // A draft has no pairs, so every source column is free; prefer the same
  // column name on the target, else the first target column.
  const nextPair = (): { source: string; target: string } | null => {
    if (targetNode === undefined) return null;
    const nextSource = sourceColumns[0];
    if (nextSource === undefined) return null;
    if (targetColumns.includes(nextSource)) return { source: nextSource, target: nextSource };
    const nextTarget = targetColumns[0];
    return nextTarget === undefined ? null : { source: nextSource, target: nextTarget };
  };

  const pair = nextPair();
  const addPairDisabled = pair === null;

  return (
    <div className="fk-card fk-card--draft">
      <div className="fk-card__header">
        <div className="fk-card__target fk-card__target--draft" title={draft.target}>
          {draft.target}
        </div>
        <label className="details__checkbox-row">
          <input
            type="checkbox"
            checked={draft.virtual}
            onChange={() => onVirtualChange(draft.draftId, !draft.virtual)}
          />
          Virtual
        </label>
        <button
          type="button"
          className="fk-card__remove"
          onClick={() => onRemove(draft.draftId)}
        >
          Remove
        </button>
      </div>
      <p className="fk-card__draft-note">Draft — add a column pair to create this FK</p>
      {sourceColumns.length > 0 && (
        <button
          type="button"
          className="fk-card__add-pair"
          disabled={addPairDisabled}
          onClick={() => {
            if (pair !== null) onAddPair(draft, pair.source, pair.target);
          }}
        >
          + Add pair
        </button>
      )}
    </div>
  );
}
