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
    <div className="details__field">
      <span className="details__label">Columns shown</span>
      <div className="column-display" role="radiogroup" aria-label="Columns shown">
        {COLUMN_DISPLAY_OPTIONS.map((option) => (
          <label key={option.value} className="column-display__option">
            <input
              type="radio"
              name="column-display"
              checked={mode === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
