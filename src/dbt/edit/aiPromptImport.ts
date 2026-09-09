import { renameColumn, setColumnDataType } from './column';
import { EditError } from './internal';
import type { AiPromptImportColumn } from '../aiPromptImport';
import type { ModelDefinition } from '../types';
import type { ApplyEditResult } from './internal';

export function applyAiPromptImport(models: ModelDefinition[], model: string, columns: AiPromptImportColumn[]): ApplyEditResult {
  const current = models.find((candidate) => candidate.name === model);
  if (current === undefined) throw new EditError(`No model named "${model}" exists in the workspace`);
  let next = models;
  for (const entry of columns) {
    const target = next.find((candidate) => candidate.name === model);
    const column = target?.columns?.find((candidate) => candidate.meta?.source_name === entry.sourceName);
    if (column === undefined) throw new EditError(`Model "${model}" has no provenance column named "${entry.sourceName}"`);
    next = renameColumn(next, model, column.name, entry.newName).models;
    const typed = next.find((candidate) => candidate.name === model);
    if (typed === undefined) throw new EditError(`No model named "${model}" exists in the workspace`);
    next = next.map((candidate) => candidate === typed ? setColumnDataType(candidate, entry.newName, entry.dataType) : candidate);
  }
  return { models: next, changed: true };
}
