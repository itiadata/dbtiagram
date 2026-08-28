/**
 * Pure state machine for the mouse-drawn foreign key gesture (spec 26): a
 * two-click sequence (source column, then target column) that commits a
 * real, single-pair `createForeignKey` edit. No `vscode` import, no DOM.
 */

export interface ColumnRef {
  model: string;
  column: string;
}

/** `active: false` = idle; `active: true, source: null` = waiting for the
 * source column; `active: true, source: ColumnRef` = waiting for the target. */
export type FkCreateState =
  | { active: false }
  | { active: true; source: ColumnRef | null };

export const FK_CREATE_IDLE: FkCreateState = { active: false };

export function startFkCreate(): FkCreateState {
  return { active: true, source: null };
}

export function cancelFkCreate(): FkCreateState {
  return { active: false };
}

export interface FkClickOutcome {
  /** The state after this click. */
  state: FkCreateState;
  /** Present only when this click completed a source -> target pair. */
  completed?: { source: ColumnRef; target: ColumnRef };
}

function sameRef(a: ColumnRef, b: ColumnRef): boolean {
  return a.model === b.model && a.column === b.column;
}

/**
 * Applies a column click to the current gesture state. A no-op (state
 * unchanged) when `state.active` is false or `ref` repeats the current
 * source.
 */
export function clickColumnForFk(state: FkCreateState, ref: ColumnRef): FkClickOutcome {
  if (!state.active) {
    return { state };
  }
  if (state.source === null) {
    return { state: { active: true, source: ref } };
  }
  if (sameRef(state.source, ref)) {
    return { state };
  }
  return { state: { active: false }, completed: { source: state.source, target: ref } };
}
