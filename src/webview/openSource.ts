/**
 * Pure orchestration (spec 15, extended by spec 25) of the "Reveal in
 * model.yml" action against a small host port. Keeping the sequencing here
 * means the VS Code editor calls live only in `src/vscode/project.ts` and
 * this logic is unit-testable.
 * Pure logic — MUST NOT import `vscode`.
 */
import { findModelDeclaration, findColumnDeclaration, type DeclarationPosition } from '../dbt/locate';

/** Everything `openModelSource` needs from the extension host. */
export interface OpenSourceHost {
  /** fsPath of the first stored file declaring `model`, or undefined. */
  findModelFile(model: string): string | undefined;
  readFileText(fsPath: string): Promise<string>;
  reveal(fsPath: string, position: DeclarationPosition | null): Promise<void>;
  showWarning(message: string): void;
  postError(message: string): void;
}

/**
 * Resolves a model to its defining file and reveals its declaration.
 *
 * The file is read from disk rather than from the in-memory store so the line
 * numbers match exactly what the editor will show. A model that cannot be
 * located still opens its file (at the top) with a warning; a model that no
 * longer exists opens nothing and reports an error.
 */
/**
 * Resolves a model (and optionally a specific column) to its defining file
 * and reveals the declaration.
 *
 * The file is read from disk rather than from the in-memory store so the line
 * numbers match exactly what the editor will show. A model that cannot be
 * located still opens its file (at the top) with a warning; a model that no
 * longer exists opens nothing and reports an error. When `column` is given
 * but cannot be located, the model's own declaration line is revealed instead,
 * with a column-specific warning.
 */
export async function openModelSource(
  host: OpenSourceHost,
  model: string,
  column?: string,
): Promise<void> {
  const fsPath = host.findModelFile(model);
  if (fsPath === undefined) {
    host.postError(`Model "${model}" is no longer defined in any model.yml`);
    return;
  }

  let text: string;
  try {
    text = await host.readFileText(fsPath);
  } catch {
    host.postError(`Could not read ${fsPath}`);
    return;
  }

  if (column === undefined) {
    const position = findModelDeclaration(text, model);
    await host.reveal(fsPath, position);

    if (position === null) {
      host.showWarning(`Could not locate "${model}" in ${fsPath}; opened the file at the top.`);
    }
    return;
  }

  const columnPosition = findColumnDeclaration(text, model, column);
  if (columnPosition !== null) {
    await host.reveal(fsPath, columnPosition);
    return;
  }

  const modelPosition = findModelDeclaration(text, model);
  await host.reveal(fsPath, modelPosition);
  host.showWarning(
    `Could not locate column "${column}" on "${model}" in ${fsPath}; revealed the model declaration instead.`,
  );
}
