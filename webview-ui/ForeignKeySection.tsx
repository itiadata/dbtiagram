/**
 * Foreign keys section of the details sidebar table view (spec 08).
 *
 * One card per FK descriptor (`node.foreignKeys` — real constraints first,
 * then virtual meta entries): a target model picker, a **Virtual** checkbox,
 * the source → target column pairs (each reassignable/removable), an **Add
 * pair** control, and a **Remove FK** button. **Add foreign key** searches the
 * workspace models and posts `addForeignKey`. Every change posts exactly one
 * edit through the existing `diagram:edit` funnel.
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

interface ForeignKeySectionProps {
  node: TableNode;
  nodes: TableNode[];
  focusedFk: ForeignKeyDescriptor | null;
  onEdit: (edit: ModelEdit) => void;
}

export function ForeignKeySection({
  node,
  nodes,
  focusedFk,
  onEdit,
}: ForeignKeySectionProps): JSX.Element {
  const modelNames = nodes.map((n) => n.id).sort();
  const foreignKeys = node.foreignKeys;

  return (
    <section className="details__sub-section">
      <h3 className="details__sub-section-title">Foreign keys</h3>
      {foreignKeys.length === 0 && <p className="details__note">No foreign keys</p>}
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
          />
        ))}
      </div>
      <SearchSelect
        options={modelNames}
        value={null}
        placeholder="Add foreign key…"
        disabled={modelNames.length === 0}
        onSelect={(target) => onEdit({ kind: 'addForeignKey', model: node.id, target })}
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
}

function FkCard({ fk, node, nodes, modelNames, focused, onEdit }: FkCardProps): JSX.Element {
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
          <input type="checkbox" checked={fk.virtual} onChange={toggleVirtual} />
          Virtual
        </label>
        <button type="button" className="fk-card__remove" onClick={remove}>
          Remove
        </button>
      </div>
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
