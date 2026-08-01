/**
 * Primary key section of the details sidebar table view (spec 08).
 *
 * The PK columns render as removable chips with a searchable add picker over
 * the model's non-PK columns; the **Virtual** checkbox switches between the
 * meta-stored (virtual) form and the three real dbt constructs. Every change
 * posts a single `setPrimaryKey` with the resulting full column list and the
 * current virtual flag.
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
  const pkSet = new Set(columns);
  const nonPkColumns = node.columns.map((c) => c.name).filter((name) => !pkSet.has(name));

  const setColumns = (nextColumns: string[]): void => {
    onEdit({ kind: 'setPrimaryKey', model: node.id, columns: nextColumns, virtual });
  };

  const addColumn = (name: string): void => setColumns([...columns, name]);

  const removeColumn = (name: string): void => setColumns(columns.filter((c) => c !== name));

  const toggleVirtual = (): void => {
    onEdit({ kind: 'setPrimaryKey', model: node.id, columns, virtual: !virtual });
  };

  return (
    <section className="details__sub-section">
      <h3 className="details__sub-section-title">Primary key</h3>
      <label className="details__checkbox-row">
        <input type="checkbox" checked={virtual} onChange={toggleVirtual} />
        Virtual
      </label>
      {!virtual && columns.length > 0 && (
        <p className="details__note">
          Saving writes the unique_combination_of_columns data test, the primary_key
          constraint, and not_null checks to the model file.
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
