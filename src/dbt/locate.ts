/**
 * Pure locator (spec 15) mapping a model.yml document and a model name to the
 * position of that model's `name:` declaration. Read-only — never mutates a
 * model.yml. Pure logic — MUST NOT import `vscode`.
 *
 * Positions come from the `yaml` package's node ranges rather than a regex, so
 * quoting, key order, and comments cannot mislead the result.
 */
import { LineCounter, parseDocument, isMap, isSeq, isScalar } from 'yaml';

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
export function findModelDeclaration(text: string, modelName: string): DeclarationPosition | null {
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if (doc.errors.length > 0) {
      return null;
    }

    const root = doc.contents;
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
      if (String(nameNode.value) !== modelName) {
        continue;
      }

      const [start, end] = nameNode.range;
      // `linePos` is one-based on both axes; the public contract is zero-based.
      const pos = lineCounter.linePos(start);
      return { line: pos.line - 1, column: pos.col - 1, length: end - start };
    }

    return null;
  } catch {
    return null;
  }
}
