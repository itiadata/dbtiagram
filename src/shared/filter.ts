/**
 * Pure filtering logic for the diagram webview (spec 05). MUST NOT import
 * `vscode`.
 *
 * The extension host always sends the full diagram graph plus per-file metadata
 * (`DiagramModelFile[]`); the webview derives its own filtered view from that
 * with these functions. All functions are pure — they never mutate their
 * inputs.
 */
import type { DiagramGraph } from '../diagram/graph';
import type { DiagramModelFile } from './protocol';

/**
 * Default cap on how many models start checked on a diagram's first load
 * (spec 35). Workspaces at or under this total are unaffected.
 */
export const INITIAL_MODEL_SELECTION_LIMIT = 20;

/**
 * The initial checked-model set for a freshly opened diagram (spec 35): the
 * first `limit` names from `modelNames` (already in file/declaration order),
 * or all of them when the total is at or under `limit`.
 */
export function capInitialSelection(
  modelNames: readonly string[],
  limit: number = INITIAL_MODEL_SELECTION_LIMIT,
): Set<string> {
  return new Set(modelNames.slice(0, limit));
}

/** Case-insensitive substring match; empty/whitespace queries match all. */
export function matchesSearch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return text.toLowerCase().includes(q);
}

/**
 * Merges the user's checked set with a fresh universe on every diagram update:
 *
 * - items present in `all` keep the user's choice;
 * - items **new** since `previous` are added (checked by default);
 * - items that left `all` are dropped from the selection.
 *
 * `previous` is the universe from the last update, which lets the merge tell a
 * brand-new file/model apart from one the user explicitly unchecked.
 */
export function reconcileSelection(
  previous: readonly string[],
  all: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const previousSet = new Set(previous);
  const allSet = new Set(all);
  const next = new Set(selected);

  for (const item of all) {
    if (!previousSet.has(item)) next.add(item);
  }
  for (const item of selected) {
    if (!allSet.has(item)) next.delete(item);
  }

  return next;
}

/**
 * Model names visible in the diagram, applying the file filter **with
 * precedence** over the model filter (spec 05): a model is visible only when
 * its file is checked AND the model itself is checked.
 */
export function computeVisibleModels(
  files: readonly DiagramModelFile[],
  selectedFiles: ReadonlySet<string>,
  selectedModels: ReadonlySet<string>,
): Set<string> {
  const visible = new Set<string>();
  for (const file of files) {
    if (!selectedFiles.has(file.uri)) continue;
    for (const model of file.models) {
      if (selectedModels.has(model)) visible.add(model);
    }
  }
  return visible;
}

/**
 * The filter selection for a diagram tab opened from a single model.yml
 * (spec 14): exactly that file checked, with exactly its models checked.
 *
 * Returns `null` when the file is unknown to the webview (it produced no
 * models, e.g. a parse failure), in which case the caller keeps spec 05's
 * all-checked default rather than blanking the diagram.
 */
export function scopeSelectionToFile(
  files: readonly DiagramModelFile[],
  uri: string,
): { files: Set<string>; models: Set<string> } | null {
  const file = files.find((candidate) => candidate.uri === uri);
  if (file === undefined) {
    return null;
  }
  return { files: new Set([file.uri]), models: new Set(file.models) };
}

/**
 * The checked-model set with `names` removed (spec 36). Pure; never mutates
 * `selected`. Names not present in `selected` are ignored.
 */
export function removeModels(
  selected: ReadonlySet<string>,
  names: readonly string[],
): Set<string> {
  const next = new Set(selected);
  for (const name of names) next.delete(name);
  return next;
}

/**
 * Keeps the nodes whose id is visible and the edges whose source AND target
 * are both visible (an edge to a hidden table is dropped, mirroring
 * `buildDiagram`'s own "only known targets" rule).
 */
export function filterGraph(
  graph: DiagramGraph,
  visible: ReadonlySet<string>,
): DiagramGraph {
  const nodes = graph.nodes.filter((node) => visible.has(node.id));
  const edges = graph.edges.filter(
    (edge) => visible.has(edge.source) && visible.has(edge.target),
  );
  return { nodes, edges };
}
