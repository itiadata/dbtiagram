/**
 * Primary key section of the details sidebar table view (spec 08).
 *
 * The PK columns render as removable chips with a searchable add picker over
 * the model's non-PK columns; the **Virtual** checkbox switches between the
 * meta-stored (virtual) form and the three real dbt constructs. A second
 * checkbox, **"Omit unique combination test"**, controls whether the
 * model-level `dbt_utils.unique_combination_of_columns` data test is written
 * alongside the `primary_key` constraint and `not_null` checks (spec 33); its
 * `checked` state is negated relative to the underlying `uniqueTest` flag
 * (checked = test omitted), and it is disabled while Virtual is checked or
 * there are no PK columns. Every change posts a single `setPrimaryKey` with
 * the resulting full column list, the current virtual flag, and the current
 * unique-test flag.
 */
import type { ModelEdit } from '../src/dbt/edit';
import type { TableNode } from '../src/diagram/graph';
import { SearchSelect } from './SearchSelect';

interface PrimaryKeySectionProps {
  node: TableNode;
  onEdit: (edit: ModelEdit) => void;
}

export function PrimaryKeySection({ node, onEdit }: PrimaryKeySectionProps): JSX.Element {
  const pk = node.primaryKey;
  const virtual = pk?.virtual ?? false;
  const columns = pk?.columns ?? [];
  const uniqueTest = pk?.uniqueTest ?? false;
  const pkSet = new Set(columns);
  const nonPkColumns = node.columns.map((c) => c.name).filter((name) => !pkSet.has(name));

  const setColumns = (nextColumns: string[]): void => {
    onEdit({ kind: 'setPrimaryKey', model: node.id, columns: nextColumns, virtual, uniqueTest });
  };

  const addColumn = (name: string): void => setColumns([...columns, name]);

  const removeColumn = (name: string): void => setColumns(columns.filter((c) => c !== name));

  const toggleVirtual = (): void => {
    onEdit({ kind: 'setPrimaryKey', model: node.id, columns, virtual: !virtual, uniqueTest });
  };

  const toggleUniqueTest = (): void => {
    onEdit({ kind: 'setPrimaryKey', model: node.id, columns, virtual, uniqueTest: !uniqueTest });
  };

  return (
    <section className="details__sub-section">
      <h3 className="details__sub-section-title">Primary key</h3>
      <label className="details__checkbox-row">
        <input type="checkbox" checked={virtual} onChange={toggleVirtual} />
        Virtual
      </label>
      <label className="details__checkbox-row">
        <input
          type="checkbox"
          checked={!uniqueTest}
          disabled={virtual || columns.length === 0}
          onChange={toggleUniqueTest}
        />
        Omit unique combination test
      </label>
      {!virtual && columns.length > 0 && (
        <p className="details__note">
          Writes the primary_key constraint and not_null checks to the model file. The
          unique combination test is omitted while the box above is checked.
        </p>
      )}
      {columns.length === 0 ? (
        <p className="details__note">No primary key</p>
      ) : (
        <div className="pk-chips">
          {columns.map((name) => (
            <span key={name} className="pk-chip">
              {name}
              <button
                type="button"
                className="pk-chip__remove"
                aria-label={`Remove ${name} from primary key`}
                onClick={() => removeColumn(name)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <SearchSelect
        options={nonPkColumns}
        value={null}
        placeholder={nonPkColumns.length > 0 ? 'Add column…' : 'No columns left'}
        disabled={nonPkColumns.length === 0}
        onSelect={addColumn}
      />
    </section>
  );
}
