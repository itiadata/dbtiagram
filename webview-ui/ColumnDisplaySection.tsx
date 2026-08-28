/**
 * "Columns shown" section of the details pane (spec 24): the four fixed
 * column-display modes as radio options, rendered between Description and
 * Primary key for the selected table.
 */
import { COLUMN_DISPLAY_OPTIONS, type ColumnDisplayMode } from '../src/diagram/columnDisplay';

export interface ColumnDisplaySectionProps {
  mode: ColumnDisplayMode;
  onChange: (mode: ColumnDisplayMode) => void;
}

export function ColumnDisplaySection({ mode, onChange }: ColumnDisplaySectionProps): JSX.Element {
  return (
    <label className="details__field">
      <span className="details__label">Columns shown</span>
      <select
        className="details__input"
        value={mode}
        onChange={(event) => onChange(event.target.value as ColumnDisplayMode)}
      >
        {COLUMN_DISPLAY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
