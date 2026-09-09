import type { ModelDefinition } from './types';

export interface AiPromptImportColumn { sourceName: string; newName: string; dataType: string; }
export interface AiPromptImportPlan { accepted: AiPromptImportColumn[]; rejected: string[]; }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonBlank(value: unknown): value is string { return typeof value === 'string' && value.trim() !== ''; }
function malformed(reason: string): never { throw new Error(`malformed response: ${reason}.`); }

export function planAiRenameTypeImport(model: ModelDefinition, clipboardText: string): AiPromptImportPlan {
  let parsed: unknown;
  try { parsed = JSON.parse(clipboardText); } catch { throw new Error('clipboard content is not valid JSON.'); }
  if (!record(parsed)) malformed('response must be an object');
  const keys = Object.keys(parsed);
  if (keys.length !== 3 || !['model', 'batch', 'columns'].every((key) => keys.includes(key))) malformed('response must contain exactly model, batch, and columns');
  if (!nonBlank(parsed.model)) malformed('model must be a non-blank string');
  if (!record(parsed.batch) || Object.keys(parsed.batch).length !== 2 || !Object.prototype.hasOwnProperty.call(parsed.batch, 'number') || !Object.prototype.hasOwnProperty.call(parsed.batch, 'total')) malformed('batch must contain exactly number and total');
  const { number, total } = parsed.batch;
  if (!Number.isInteger(number) || typeof number !== 'number' || number < 1) malformed('batch.number must be a positive integer');
  if (!Number.isInteger(total) || typeof total !== 'number' || total < 1) malformed('batch.total must be a positive integer');
  if (number > total) malformed('batch.number must not exceed batch.total');
  if (!Array.isArray(parsed.columns)) malformed('columns must be an array');
  if (parsed.model !== model.name) throw new Error(`response model "${parsed.model}" does not match current model "${model.name}".`);
  const bySource = new Map<string, string>();
  for (const column of model.columns ?? []) if (nonBlank(column.meta?.source_name)) bySource.set(column.meta.source_name, column.name);
  const accepted: AiPromptImportColumn[] = [];
  const rejected: string[] = [];
  const seenSources = new Set<string>();
  for (const item of parsed.columns) {
    if (!record(item) || Object.keys(item).length !== 3 || !['source_name', 'new_name', 'data_type'].every((key) => Object.prototype.hasOwnProperty.call(item, key)) || !nonBlank(item.source_name) || !nonBlank(item.new_name) || !nonBlank(item.data_type)) {
      if (record(item) && nonBlank(item.source_name)) seenSources.add(item.source_name);
      rejected.push('result item must contain non-blank source_name, new_name, and data_type');
      continue;
    }
    if (seenSources.has(item.source_name)) { rejected.push(`duplicate source_name "${item.source_name}"`); continue; }
    seenSources.add(item.source_name);
    if (!bySource.has(item.source_name)) { rejected.push(`unknown source_name "${item.source_name}"`); continue; }
    accepted.push({ sourceName: item.source_name, newName: item.new_name, dataType: item.data_type });
  }
  const usedNames = new Set<string>();
  const kept: AiPromptImportColumn[] = [];
  for (const item of accepted) {
    const currentName = bySource.get(item.sourceName) as string;
    const collision = usedNames.has(item.newName) || ((model.columns ?? []).some((column) => column.name === item.newName) && item.newName !== currentName);
    if (collision) rejected.push(`new_name "${item.newName}" conflicts with an existing result or column`); else { usedNames.add(item.newName); kept.push(item); }
  }
  return { accepted: kept, rejected };
}
