import { LineCounter, isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml';
import type { DeclarationPosition } from './locate';

function namedItem(sequence: unknown, name: string): YAMLMap | null {
  if (!isSeq(sequence)) return null;
  for (const item of sequence.items) {
    if (!isMap(item)) continue;
    const value = item.get('name', true);
    if (isScalar(value) && String(value.value) === name) return item;
  }
  return null;
}

function locate(text: string, sourceName: string, tableName: string, columnName?: string): DeclarationPosition | null {
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if (doc.errors.length > 0 || !isMap(doc.contents)) return null;
    const source = namedItem(doc.contents.get('sources', true), sourceName);
    const table = source === null ? null : namedItem(source.get('tables', true), tableName);
    const item = columnName === undefined || table === null ? table : namedItem(table.get('columns', true), columnName);
    if (item === null) return null;
    const node = item.get('name', true);
    if (!isScalar(node) || node.range == null) return null;
    const [start, end] = node.range;
    const position = lineCounter.linePos(start);
    return { line: position.line - 1, column: position.col - 1, length: end - start };
  } catch { return null; }
}

export function findSourceTableDeclaration(text: string, sourceName: string, tableName: string): DeclarationPosition | null {
  return locate(text, sourceName, tableName);
}
export function findSourceColumnDeclaration(text: string, sourceName: string, tableName: string, columnName: string): DeclarationPosition | null {
  return locate(text, sourceName, tableName, columnName);
}
