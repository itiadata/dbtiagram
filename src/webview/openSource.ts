/**
 * Pure orchestration (spec 15, extended by spec 25) of the "Reveal in
 * model.yml" action against a small host port. Keeping the sequencing here
 * means the VS Code editor calls live only in `src/vscode/project.ts` and
 * this logic is unit-testable.
 * Pure logic — MUST NOT import `vscode`.
 */
import { findModelDeclaration, findColumnDeclaration, type DeclarationPosition } from '../dbt/locate';
import { findSourceColumnDeclaration, findSourceTableDeclaration } from '../dbt/sourceLocate';
import { parseDiagramEntityId, type DiagramEntityId } from '../shared/entityId';

/** Everything `openModelSource` needs from the extension host. */
export interface OpenSourceHost {
  /** fsPath of the first stored file declaring `model`, or undefined. */
  findEntityFile(entity: DiagramEntityId): string | undefined;
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
export interface OpenSourceRequest { entity: DiagramEntityId; column?: string }

export async function openDiagramSource(host: OpenSourceHost, request: OpenSourceRequest): Promise<void> {
  const { entity, column } = request;
  const parsed = parseDiagramEntityId(entity);
  if (parsed === null || parsed.kind === 'external') { host.postError(`Entity "${entity}" is not editable`); return; }
  const mode = parsed.kind;
  const rawEntity = parsed.kind === 'model' ? parsed.name : `${parsed.sourceName}.${parsed.tableName}`;
  const fsPath = host.findEntityFile(entity);
  if (fsPath === undefined) {
    host.postError(`${mode === 'model' ? 'Model' : 'Table'} "${rawEntity}" is no longer defined in any ${mode === 'model' ? 'model.yml' : 'source yml'}`);
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
    const [sourceName, tableName] = splitSource(rawEntity);
    const position = mode === 'model' ? findModelDeclaration(text, rawEntity) : findSourceTableDeclaration(text, sourceName, tableName);
    await host.reveal(fsPath, position);

    if (position === null) {
      host.showWarning(`Could not locate "${rawEntity}" in ${fsPath}; opened the file at the top.`);
    }
    return;
  }

  const [sourceName, tableName] = splitSource(rawEntity);
  const columnPosition = mode === 'model' ? findColumnDeclaration(text, rawEntity, column) : findSourceColumnDeclaration(text, sourceName, tableName, column);
  if (columnPosition !== null) {
    await host.reveal(fsPath, columnPosition);
    return;
  }

  const modelPosition = mode === 'model' ? findModelDeclaration(text, rawEntity) : findSourceTableDeclaration(text, sourceName, tableName);
  await host.reveal(fsPath, modelPosition);
  host.showWarning(
    `Could not locate column "${column}" on "${rawEntity}" in ${fsPath}; revealed the ${mode === 'model' ? 'model' : 'table'} declaration instead.`,
  );
}

function splitSource(entity: string): [string, string] { const dot = entity.indexOf('.'); return [entity.slice(0, dot), entity.slice(dot + 1)]; }

export function openModelSource(host: OpenSourceHost, model: string, column?: string): Promise<void> {
  return openDiagramSource(host, { entity: `model:unknown:${model}`, column });
}
