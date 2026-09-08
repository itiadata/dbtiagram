import { isMap, parseDocument } from 'yaml';
import type { SourceYmlFile } from './sourceTypes';
import { serializeSourceYml, toDbtSourceShape } from './sourceSerialize';
import { COLUMN_KEY_ORDER, FREE_KEY_ORDER, MODEL_KEY_ORDER } from './merge/order';
import { deepEqual, reconcileNode, type ManagedShape, type MergePolicy } from './merge/reconcile';

const TABLE_DELETABLE = new Map<string, ManagedShape>([['description', 'string'], ['config', 'mapping'], ['columns', 'sequence']]);
const COLUMN_DELETABLE = new Map<string, ManagedShape>([['data_type', 'string'], ['description', 'string'], ['tests', 'sequence'], ['data_tests', 'sequence']]);
const FREE: MergePolicy = { deletable: 'all', order: FREE_KEY_ORDER, child: () => FREE };
const FLOW: MergePolicy = { ...FREE, flowOnCreate: true };
const COLUMN_CONFIG: MergePolicy = { deletable: 'all', order: FREE_KEY_ORDER, child: (key) => key === 'meta' ? FLOW : FREE };
const COLUMN: MergePolicy = { deletable: COLUMN_DELETABLE, order: COLUMN_KEY_ORDER, child: (key) => key === 'config' ? COLUMN_CONFIG : FREE };
const COLUMNS: MergePolicy = { deletable: 'all', order: FREE_KEY_ORDER, child: () => COLUMN };
const TABLE: MergePolicy = { deletable: TABLE_DELETABLE, order: MODEL_KEY_ORDER, child: (key) => key === 'columns' ? COLUMNS : FREE };
const TABLES: MergePolicy = { deletable: 'all', order: FREE_KEY_ORDER, child: () => TABLE };
const SOURCE: MergePolicy = { deletable: new Map<string, ManagedShape>([['description', 'string'], ['tables', 'sequence']]), order: FREE_KEY_ORDER, child: (key) => key === 'tables' ? TABLES : FREE };
const SOURCES: MergePolicy = { deletable: 'all', order: FREE_KEY_ORDER, child: () => SOURCE };
const ROOT: MergePolicy = { deletable: new Map(), order: FREE_KEY_ORDER, child: (key) => key === 'sources' ? SOURCES : FREE };

export function mergeSourceYml(originalText: string, file: SourceYmlFile): string {
  const desired = toDbtSourceShape(file);
  let doc;
  try { doc = parseDocument(originalText); } catch { return serializeSourceYml(file); }
  if (doc.errors.length > 0 || !isMap(doc.contents)) return serializeSourceYml(file);
  if (deepEqual(doc.contents.toJSON() as unknown, desired)) return originalText;
  reconcileNode(doc.contents, desired, ROOT);
  const compact = /[[{][^\s[\]{}]/.test(originalText);
  const padded = /[[{] \S/.test(originalText);
  const output = doc.toString({ lineWidth: 0, flowCollectionPadding: padded || !compact });
  return originalText.includes('\r\n') ? output.replace(/\r?\n/g, '\r\n') : output;
}
