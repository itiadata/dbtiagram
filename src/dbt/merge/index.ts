/**
 * Surgical write-back for dbt `model.yml` files (spec 29). Pure logic — MUST
 * NOT import `vscode`.
 *
 * Instead of regenerating the file from the domain model, `mergeModelYml`
 * patches the *existing* YAML document with the desired state, so unknown
 * keys, on-disk key order, comments and formatting all survive. When the
 * original text cannot be used as a base, it falls back to the full
 * serializer so no edit is ever silently dropped.
 */
import { parseDocument, isMap } from 'yaml';
import { serializeModelYml } from '../serialize';
import type { ModelYmlFile } from '../types';
import { toDbtShape } from './shape';
import { COLUMN_KEY_ORDER, FREE_KEY_ORDER, MODEL_KEY_ORDER } from './order';
import { deepEqual, reconcileNode, type MergePolicy } from './reconcile';

export { toDbtShape } from './shape';
export { reconcileNode, type MergePolicy } from './reconcile';
export {
  COLUMN_KEY_ORDER,
  FREE_KEY_ORDER,
  MODEL_KEY_ORDER,
  insertionIndex,
  type KeyOrder,
} from './order';

const MODEL_DELETABLE: ReadonlySet<string> = new Set([
  'description',
  'data_tests',
  'constraints',
  'config',
  'columns',
  'meta',
]);

const COLUMN_DELETABLE: ReadonlySet<string> = new Set([
  'data_type',
  'description',
  'tests',
  'data_tests',
  'meta',
]);

/**
 * Levels below a model/column are reproduced verbatim by `parseModelYml`, so
 * a key missing from the desired state there is a genuine removal.
 */
const FREE_POLICY: MergePolicy = {
  deletable: 'all',
  order: FREE_KEY_ORDER,
  child: () => FREE_POLICY,
};

const COLUMN_POLICY: MergePolicy = {
  deletable: COLUMN_DELETABLE,
  order: COLUMN_KEY_ORDER,
  child: () => FREE_POLICY,
};

const COLUMNS_SEQ_POLICY: MergePolicy = {
  deletable: 'all',
  order: FREE_KEY_ORDER,
  child: () => COLUMN_POLICY,
};

const MODEL_POLICY: MergePolicy = {
  deletable: MODEL_DELETABLE,
  order: MODEL_KEY_ORDER,
  child: (key) => (key === 'columns' ? COLUMNS_SEQ_POLICY : FREE_POLICY),
};

const MODELS_SEQ_POLICY: MergePolicy = {
  deletable: 'all',
  order: FREE_KEY_ORDER,
  child: () => MODEL_POLICY,
};

/** Nothing at the root of a model.yml is ever removed. */
const ROOT_POLICY: MergePolicy = {
  deletable: new Set<string>(),
  order: FREE_KEY_ORDER,
  child: (key) => (key === 'models' ? MODELS_SEQ_POLICY : FREE_POLICY),
};

/**
 * Patches `originalText` so that it expresses `file`, touching only the nodes
 * that actually differ.
 */
export function mergeModelYml(originalText: string, file: ModelYmlFile): string {
  const desired = toDbtShape(file);

  let doc;
  try {
    doc = parseDocument(originalText);
  } catch {
    return serializeModelYml(file);
  }

  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    return serializeModelYml(file);
  }

  // A no-op merge must return the input byte for byte; short-circuiting also
  // avoids any risk of `yaml` re-formatting an untouched document.
  if (deepEqual(doc.contents.toJSON() as unknown, desired)) {
    return originalText;
  }

  reconcileNode(doc.contents, desired, ROOT_POLICY);

  // `yaml` normalizes flow-collection padding on every node it re-emits, even
  // untouched ones. Matching the document's own convention keeps regions the
  // merge did not touch byte-identical.
  const output = doc.toString({ flowCollectionPadding: usesFlowPadding(originalText) });
  return originalText.includes('\r\n') ? output.replace(/\r?\n/g, '\r\n') : output;
}

/** Whether the document writes flow collections as `[ a ]` rather than `[a]`. */
function usesFlowPadding(text: string): boolean {
  const compact = /[[{][^\s[\]{}]/.test(text);
  const padded = /[[{] \S/.test(text);
  return padded || !compact;
}
