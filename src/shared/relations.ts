/**
 * Pure one-hop neighbour lookup over a `DiagramGraph`, and the file set
 * declaring a group of models (spec 37). Shared — MUST NOT import `vscode`.
 */
import type { DiagramGraph } from '../diagram/graph';
import type { DiagramModelFile } from './protocol';

/**
 * The models one FK hop away from `model`, in both directions: edge targets
 * where `model` is the source, plus edge sources where `model` is the target.
 *
 * Returned in edge order with duplicates collapsed. `model` itself is never
 * included (self-referencing edges are already dropped by `buildDiagram`).
 */
export function relatedModels(graph: DiagramGraph, model: string): string[] {
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === model) {
      seen.add(edge.target);
    } else if (edge.target === model) {
      seen.add(edge.source);
    }
  }
  return [...seen];
}

/**
 * The uris of the model.yml files declaring any of `models`, in `files` order
 * with duplicates collapsed. Used so adding a model also checks its file,
 * which otherwise hides it by file precedence (spec 05).
 */
export function filesDeclaring(
  files: readonly DiagramModelFile[],
  models: readonly string[],
): string[] {
  const modelSet = new Set(models);
  const uris: string[] = [];
  for (const file of files) {
    if (file.models.some((name) => modelSet.has(name))) {
      uris.push(file.uri);
    }
  }
  return uris;
}
