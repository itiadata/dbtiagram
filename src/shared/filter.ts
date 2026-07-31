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
