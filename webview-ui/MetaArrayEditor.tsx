import { useEffect, useState } from 'react';
import {
  isEditableMetaScalar,
  matrixMetaPreview,
  parseEditedMetaScalar,
} from './matrix-meta-values';

export interface MetaArrayEditorProps {
  model: string;
  column: string;
  metaKey: string;
  values: readonly unknown[];
  onSave: (values: readonly unknown[]) => void;
  onCancel: () => void;
}

interface ItemDraft { editing: boolean; text: string; error?: string }

export function MetaArrayEditor(props: MetaArrayEditorProps): JSX.Element {
  const [drafts, setDrafts] = useState<ItemDraft[]>(() =>
    props.values.map((value) => ({ editing: false, text: matrixMetaPreview(value) })),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); props.onCancel(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [props.onCancel]);

  function save(): void {
    let invalid = false;
    const nextDrafts = [...drafts];
    const nextValues = props.values.map((value, index) => {
      if (!isEditableMetaScalar(value)) return value;
      const parsed = parseEditedMetaScalar(value, drafts[index]?.text ?? '');
      if (!parsed.ok) {
        invalid = true;
        nextDrafts[index] = { ...nextDrafts[index], error: parsed.error };
        return value;
      }
      nextDrafts[index] = { ...nextDrafts[index], error: undefined };
      return parsed.value;
    });
    setDrafts(nextDrafts);
    if (!invalid) props.onSave(nextValues);
  }

  return <div className="meta-array-editor-overlay" onPointerDown={(event) => event.stopPropagation()}>
    <div className="meta-array-editor" role="dialog" aria-label={`Edit ${props.model}.${props.column} ${props.metaKey}`}>
      <header><h3>{props.metaKey}</h3><button type="button" className="panel-button panel-button--secondary" onClick={props.onCancel}>Close</button></header>
      <div className="meta-array-editor__items">
        {props.values.map((value, index) => {
          const editable = isEditableMetaScalar(value);
          const draft = drafts[index];
          return <div className={`meta-array-editor__item${editable ? '' : ' meta-array-editor__item--readonly'}`} key={index}
            onDoubleClick={() => { if (editable) setDrafts((current) => current.map((item, i) => i === index ? { ...item, editing: true } : item)); }}>
            <span className="meta-array-editor__index">{index + 1}</span>
            {editable && draft?.editing ? <input autoFocus type="text" value={draft.text}
              onChange={(event) => setDrafts((current) => current.map((item, i) => i === index ? { ...item, text: event.target.value, error: undefined } : item))} />
              : <span className="meta-array-editor__value">{matrixMetaPreview(value)}</span>}
            {!editable && <small>Read-only</small>}
            {draft?.error !== undefined && <span className="meta-array-editor__error">{draft.error}</span>}
          </div>;
        })}
      </div>
      <footer><button type="button" className="panel-button panel-button--secondary" onClick={props.onCancel}>Cancel</button><button type="button" className="panel-button" onClick={save}>Save</button></footer>
    </div>
  </div>;
}
