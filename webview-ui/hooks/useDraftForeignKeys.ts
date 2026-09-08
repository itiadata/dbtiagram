/**
 * Webview-only draft foreign keys (spec 09 merged).
 *
 * Nothing is persisted until a draft's first column pair is added: "Add
 * foreign key" only appends a draft, the first pair persists the FK via
 * `createForeignKey`, and removing the last pair of a persisted FK deletes it
 * while keeping a draft with the same target/virtual flag.
 */
import { useCallback, useRef, useState } from 'react';
import type { ModelEdit } from '../../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../../src/dbt/types';
import type { DraftForeignKey } from '../ForeignKeySection';

export interface DraftForeignKeysState {
  draftFks: Record<string, DraftForeignKey[]>;
  addDraft: (model: string, target: string) => void;
  removeDraft: (model: string, draftId: string) => void;
  setDraftVirtual: (model: string, draftId: string, virtual: boolean) => void;
  addDraftPair: (
    model: string,
    draft: DraftForeignKey,
    source: string,
    target: string,
  ) => void;
  removeLastPair: (model: string, fk: ForeignKeyDescriptor) => void;
}

export function useDraftForeignKeys(
  onEdit: (edit: ModelEdit) => void,
  forceVirtual = false,
): DraftForeignKeysState {
  // Keyed by model id; each draft carries a locally unique id.
  const [draftFks, setDraftFks] = useState<Record<string, DraftForeignKey[]>>({});
  const draftIdCounterRef = useRef(0);

  const appendDraft = useCallback(
    (model: string, target: string, virtual: boolean): void => {
      setDraftFks((current) => {
        const draft: DraftForeignKey = {
          draftId: `draft-${draftIdCounterRef.current}`,
          target,
          virtual,
          columns: [],
          toColumns: [],
        };
        draftIdCounterRef.current += 1;
        return { ...current, [model]: [...(current[model] ?? []), draft] };
      });
    },
    [],
  );

  const addDraft = useCallback(
    (model: string, target: string): void => {
      appendDraft(model, target, forceVirtual);
    },
    [appendDraft, forceVirtual],
  );

  const removeDraft = useCallback((model: string, draftId: string): void => {
    setDraftFks((current) => {
      const drafts = (current[model] ?? []).filter((d) => d.draftId !== draftId);
      const next = { ...current };
      if (drafts.length === 0) delete next[model];
      else next[model] = drafts;
      return next;
    });
  }, []);

  const setDraftVirtual = useCallback(
    (model: string, draftId: string, virtual: boolean): void => {
      setDraftFks((current) => ({
        ...current,
        [model]: (current[model] ?? []).map((d) =>
          d.draftId === draftId ? { ...d, virtual: forceVirtual || virtual } : d,
        ),
      }));
    },
    [forceVirtual],
  );

  const addDraftPair = useCallback(
    (model: string, draft: DraftForeignKey, source: string, target: string): void => {
      onEdit({
        kind: 'createForeignKey',
        model,
        target: draft.target,
        columns: [source],
        toColumns: [target],
        virtual: forceVirtual || draft.virtual,
      });
      removeDraft(model, draft.draftId);
    },
    [onEdit, removeDraft, forceVirtual],
  );

  const removeLastPair = useCallback(
    (model: string, fk: ForeignKeyDescriptor): void => {
      onEdit({ kind: 'removeForeignKey', model, fk });
      const target = fk.target;
      if (target !== undefined) {
        appendDraft(model, target, forceVirtual || fk.virtual);
      }
    },
    [onEdit, appendDraft, forceVirtual],
  );

  return { draftFks, addDraft, removeDraft, setDraftVirtual, addDraftPair, removeLastPair };
}
