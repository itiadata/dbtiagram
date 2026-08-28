/**
 * Pure locator (spec 15, extended by spec 25) mapping a model.yml document to
 * the position of a model's `name:` declaration, or of a specific column's
 * `name:` entry within that model's `columns:` list. Read-only — never
 * mutates a model.yml. Pure logic — MUST NOT import `vscode`.
 *
 * Positions come from the `yaml` package's node ranges rather than a regex, so
 * quoting, key order, and comments cannot mislead the result.
 */
import { LineCounter, parseDocument, isMap, isSeq, isScalar, type YAMLMap } from 'yaml';

/** Zero-based position of a model name token inside a model.yml file. */
export interface DeclarationPosition {
  /** Zero-based line of the model's `name:` entry. */
  line: number;
  /** Zero-based column where the model name token starts. */
  column: number;
  /** Length of the model name token as written, including any quotes. */
  length: number;
}

/**
 * Finds where `modelName` is declared in `text`, or `null` when it cannot be
 * located. Never throws: malformed YAML, a non-mapping root, a missing or
 * non-sequence `models` key, and unknown names all yield `null` so callers can
 * still open the file at the top.
 */
/**
 * Finds the mapping item under `models:` whose `name` equals `modelName`, or
 * `null` when the document shape is unexpected or no item matches. Shared by
 * `findModelDeclaration` and `findColumnDeclaration`.
 */
function findModelItem(root: unknown, modelName: string): YAMLMap | null {
  if (!isMap(root)) {
    return null;
  }

  const models = root.get('models', true);
  if (!isSeq(models)) {
    return null;
  }

  for (const item of models.items) {
    if (!isMap(item)) {
      continue;
    }
    const nameNode = item.get('name', true);
    if (!isScalar(nameNode) || nameNode.range == null) {
      continue;
    }
    if (String(nameNode.value) === modelName) {
      return item;
    }
  }

  return null;
}

/**
 * Finds where `modelName` is declared in `text`, or `null` when it cannot be
 * located. Never throws: malformed YAML, a non-mapping root, a missing or
 * non-sequence `models` key, and unknown names all yield `null` so callers can
 * still open the file at the top.
 */
export function findModelDeclaration(text: string, modelName: string): DeclarationPosition | null {
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if (doc.errors.length > 0) {
      return null;
    }

    const item = findModelItem(doc.contents, modelName);
    if (item === null) {
      return null;
    }

    const nameNode = item.get('name', true);
    if (!isScalar(nameNode) || nameNode.range == null) {
      return null;
    }

    const [start, end] = nameNode.range;
    // `linePos` is one-based on both axes; the public contract is zero-based.
    const pos = lineCounter.linePos(start);
    return { line: pos.line - 1, column: pos.col - 1, length: end - start };
  } catch {
    return null;
  }
}

/**
 * Finds where `columnName` is declared under `modelName`'s `columns:` list in
 * `text`, or `null` when the model, its `columns` key, or the column itself
 * cannot be located. Never throws, for the same reasons as
 * `findModelDeclaration`.
 */
export function findColumnDeclaration(
  text: string,
  modelName: string,
  columnName: string,
): DeclarationPosition | null {
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if (doc.errors.length > 0) {
      return null;
    }

    const modelItem = findModelItem(doc.contents, modelName);
    if (modelItem === null) {
      return null;
    }

    const columns = modelItem.get('columns', true);
    if (!isSeq(columns)) {
      return null;
    }

    for (const item of columns.items) {
      if (!isMap(item)) {
        continue;
      }
      const nameNode = item.get('name', true);
      if (!isScalar(nameNode) || nameNode.range == null) {
        continue;
      }
      if (String(nameNode.value) !== columnName) {
        continue;
      }

      const [start, end] = nameNode.range;
      const pos = lineCounter.linePos(start);
      return { line: pos.line - 1, column: pos.col - 1, length: end - start };
    }

    return null;
  } catch {
    return null;
  }
}
