/**
 * The "Open new diagrams" settings overlay (spec 23): a fixed-size,
 * non-resizable panel listing the four open-behavior options with a
 * one-line description each. Dismissible via its Close button, clicking
 * outside it, or Escape — consistent with `ContextMenu`'s conventions.
 */
import { useEffect, useRef } from 'react';
import { OPEN_BEHAVIOR_OPTIONS, type OpenBehavior } from '../src/shared/openBehavior';

export interface SettingsPanelProps {
  value: OpenBehavior;
  onChange: (value: OpenBehavior) => void;
  onClose: () => void;
}

export function SettingsPanel({ value, onChange, onClose }: SettingsPanelProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const element = ref.current;
      if (element !== null && event.target instanceof globalThis.Node && element.contains(event.target)) {
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  return (
    <div className="settings-overlay">
      <div className="settings-panel" ref={ref} role="dialog" aria-label="Settings">
        <div className="settings-panel__header">
          <h2>Settings</h2>
          <button type="button" className="panel-button" onClick={onClose}>
            Close
          </button>
        </div>
        <fieldset className="settings-panel__section">
          <legend>Open new diagrams</legend>
          <ul className="settings-panel__options">
            {OPEN_BEHAVIOR_OPTIONS.map((option) => (
              <li key={option.value}>
                <label className="settings-panel__option">
                  <input
                    type="radio"
                    name="openBehavior"
                    checked={value === option.value}
                    onChange={() => onChange(option.value)}
                  />
                  <span className="settings-panel__option-label">{option.label}</span>
                  <span className="settings-panel__option-description">{option.description}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </div>
  );
}
