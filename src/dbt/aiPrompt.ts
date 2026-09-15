import type { ModelColumn, ModelDefinition } from './types';

export interface AiPromptColumn {
  sourceName: string;
  currentName: string;
  currentDataType?: string;
  description?: string;
  sourceDataType: string;
  sampleValues?: unknown[];
  sourceLength?: unknown;
  sourceMaxLength?: unknown;
}

export interface AiPromptBatch {
  model: string;
  sourceTable: string;
  number: number;
  total: number;
  columns: AiPromptColumn[];
}

export interface AiPromptRequest {
  model: string;
  batchSize: number;
  batchNumber: number;
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function eligibleColumn(column: ModelColumn): AiPromptColumn | undefined {
  const sourceName = nonBlankString(column.meta?.source_name);
  const sourceDataType = nonBlankString(column.meta?.source_datatype);
  if (sourceName === undefined || sourceDataType === undefined) return undefined;
  return {
    sourceName,
    currentName: column.name,
    currentDataType: column.dataType,
    description: column.description,
    sourceDataType,
    sampleValues: Array.isArray(column.meta?.source_sample_values) ? column.meta.source_sample_values : undefined,
    sourceLength: column.meta?.source_length,
    sourceMaxLength: column.meta?.source_max_length,
  };
}

export function eligibleAiPromptColumns(model: ModelDefinition): AiPromptColumn[] {
  return (model.columns ?? []).flatMap((column) => {
    const eligible = eligibleColumn(column);
    return eligible === undefined ? [] : [eligible];
  });
}

export function aiPromptBatch(model: ModelDefinition, request: AiPromptRequest): AiPromptBatch {
  if (!Number.isInteger(request.batchSize) || request.batchSize < 1) {
    throw new Error('Batch size must be a positive integer.');
  }
  const columns = eligibleAiPromptColumns(model);
  const total = Math.ceil(columns.length / request.batchSize);
  if (!Number.isInteger(request.batchNumber) || request.batchNumber < 1 || request.batchNumber > total) {
    throw new Error(`Batch number must be between 1 and ${total}.`);
  }
  const configMeta = model.config?.meta;
  const sourceTable = nonBlankString(configMeta !== undefined && typeof configMeta === 'object' ? (configMeta as Record<string, unknown>).source_name : undefined) ?? model.name;
  return {
    model: model.name,
    sourceTable,
    number: request.batchNumber,
    total,
    columns: columns.slice((request.batchNumber - 1) * request.batchSize, request.batchNumber * request.batchSize),
  };
}

function jsonSafe(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function evidence(column: AiPromptColumn): Record<string, unknown> {
  const line: Record<string, unknown> = { s: column.sourceName, n: column.currentName };
  if (column.currentDataType !== undefined) line.t = column.currentDataType;
  if (column.description !== undefined) line.d = column.description;
  line.st = column.sourceDataType;
  if (column.sampleValues !== undefined) line.v = column.sampleValues.map(jsonSafe);
  if (column.sourceLength !== undefined) line.l = jsonSafe(column.sourceLength);
  if (column.sourceMaxLength !== undefined) line.m = jsonSafe(column.sourceMaxLength);
  return line;
}

export function buildAiRenameTypePrompt(batch: AiPromptBatch, rules: string): string {
  const example = { model: batch.model, batch: { number: batch.number, total: batch.total }, columns: batch.columns.map((column) => ({ source_name: column.sourceName, new_name: 'ID_EXAMPLE', data_type: 'INTEGER' })) };
  return `${rules.trim()}\n\nModel: ${batch.model}\nSource table: ${batch.sourceTable}\nBatch ${batch.number} of ${batch.total}\n\nJSONL legend: s=source name, n=current model name, t=current model data type, d=description, st=source data type, v=source sample values, l=source length, m=source maximum observed length.\n${batch.columns.map((column) => JSON.stringify(evidence(column))).join('\n')}\n\nRespond with exactly one valid JSON object, with no Markdown fence, prose, or extra keys. It must have model "${batch.model}" and batch number ${batch.number} of ${batch.total}. Return exactly one result for every input column and no other columns. Preserve source_name byte-for-byte. Each result may contain only source_name, new_name, and data_type.\n${JSON.stringify(example)}`;
}
