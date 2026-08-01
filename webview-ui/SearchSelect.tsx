/**
 * A reusable searchable picker for the details sidebar (spec 08): a button
 * shows the current value; clicking opens a text input that filters the option
 * list by case-insensitive substring; clicking an option commits and closes.
 * Used for FK target models and for adding/reassigning columns.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface SearchSelectProps {
  /** Options to pick from. */
  options: string[];
  /** Currently selected value, or null for a placeholder state. */
  value: string | null;
  placeholder?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}

export function SearchSelect({
  options,
  value,
  placeholder,
  disabled,
  onSelect,
}: SearchSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when the user clicks anywhere outside the picker.
  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [open]);

  const filtered =
    query.length === 0
      ? options
      : options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));

  const pick = (option: string): void => {
    setOpen(false);
    setQuery('');
    onSelect(option);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (event.key === 'Enter' && filtered.length > 0) {
      pick(filtered[0]);
    }
  };

  return (
    <div className="search-select" ref={rootRef}>
      {open ? (
        <>
          <input
            className="search-select__input"
            value={query}
            placeholder="Search…"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="search-select__menu">
            {filtered.length === 0 ? (
              <div className="search-select__empty">No matches</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="search-select__option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(option)}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          className={`search-select__button${
            value === null ? ' search-select__button--placeholder' : ''
          }`}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {value ?? placeholder ?? 'Select…'}
        </button>
      )}
    </div>
  );
}
