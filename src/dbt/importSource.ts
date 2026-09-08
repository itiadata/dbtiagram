import { parseSourceRef } from './sourceRefs';
import type { ModelColumn, ModelDefinition, ModelYmlFile, VirtualForeignKey } from './types';
import type { QualifiedSourceTable } from './sourceTypes';
import { readVirtualConstraints, writeVirtualConstraints } from './virtual';
import { setPrimaryKeyOnModel } from './edit/primaryKey';

export interface BrokenImportedForeignKey {
  model: string;
  columns: string[];
  target: string;
  toColumns: string[];
  display: string;
}

export interface SourceImportResult {
  destination: ModelYmlFile;
  importedModels: string[];
  brokenForeignKeys: BrokenImportedForeignKey[];
}

export function nextImportedModelName(tableName: string, occupied: ReadonlySet<string>): string {
  const base = `${tableName}_from_source`;
  if (!occupied.has(base)) return base;
  let suffix = 1;
  while (occupied.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function importSourceTables(
  destination: ModelYmlFile,
  selected: readonly QualifiedSourceTable[],
  workspaceModels: readonly ModelDefinition[],
): SourceImportResult {
  const occupied = new Set(workspaceModels.map((model) => model.name));
  const allocated = new Map<string, string>();
  for (const source of selected) {
    const name = nextImportedModelName(source.table.name, occupied);
    occupied.add(name);
    allocated.set(source.id, name);
  }

  const imported = selected.map((source) => convertTable(source, allocated));
  const available = new Set([...workspaceModels.map((model) => model.name), ...imported.map((model) => model.name)]);
  const brokenForeignKeys = imported.flatMap((model) => brokenForModel(model, available));
  return {
    destination: { ...destination, models: [...destination.models, ...imported] },
    importedModels: imported.map((model) => model.name),
    brokenForeignKeys,
  };
}

function convertTable(source: QualifiedSourceTable, allocated: ReadonlyMap<string, string>): ModelDefinition {
  const table = source.table;
  const tableConfig = cloneRecord(table.config) ?? {};
  const tableMeta = isRecord(tableConfig.meta) ? tableConfig.meta : {};
  tableConfig.meta = { ...tableMeta, source_table_name: table.name };
  let model: ModelDefinition = {
    ...(cloneRecord(table.extra) !== undefined ? { extra: cloneRecord(table.extra) } : {}),
    name: allocated.get(source.id) ?? `${table.name}_from_source`,
    ...(table.description !== undefined ? { description: table.description } : {}),
    config: tableConfig,
    ...(table.columns !== undefined ? { columns: table.columns.map(cloneColumn) } : {}),
  };
  const virtual = readVirtualConstraints(model);
  model = writeVirtualConstraints(model, {});
  if (virtual.primaryKey !== undefined) {
    model = setPrimaryKeyOnModel(model, virtual.primaryKey.columns, false, true);
  }
  if (virtual.foreignKeys !== undefined) {
    const foreignKeys = virtual.foreignKeys.map((fk) => rewriteForeignKey(fk, allocated));
    model = {
      ...model,
      constraints: [
        ...(model.constraints ?? []),
        ...foreignKeys.map((fk) => ({
          type: 'foreign_key',
          to: fk.to,
          columns: [...fk.columns],
          toColumns: [...fk.toColumns],
        })),
      ],
    };
  }
  return model;
}

function rewriteForeignKey(fk: VirtualForeignKey, allocated: ReadonlyMap<string, string>): VirtualForeignKey {
  const sourceRef = parseSourceRef(fk.to);
  if (sourceRef === null) return fk;
  const target = allocated.get(sourceRef.id) ?? `${sourceRef.table}_from_source`;
  return { ...fk, to: `ref('${target}')`, columns: [...fk.columns], toColumns: [...fk.toColumns] };
}

function brokenForModel(model: ModelDefinition, available: ReadonlySet<string>): BrokenImportedForeignKey[] {
  const out: BrokenImportedForeignKey[] = [];
  const foreignKeys = (model.constraints ?? []).filter((constraint) => constraint.type === 'foreign_key');
  for (const fk of foreignKeys) {
    if (fk.to === undefined) continue;
    const match = /^ref\('([^']+)'\)$/.exec(fk.to);
    if (match === null || available.has(match[1])) continue;
    const columns = fk.columns ?? [];
    const toColumns = fk.toColumns ?? [];
    const sourceSuffix = columns.length === 0 ? '' : `.${columns.join(',')}`;
    const targetSuffix = toColumns.length === 0 ? '' : `.${toColumns.join(',')}`;
    out.push({
      model: model.name,
      columns: [...columns],
      target: match[1],
      toColumns: [...toColumns],
      display: `${model.name}${sourceSuffix} -> ref('${match[1]}')${targetSuffix}`,
    });
  }
  return out;
}

function cloneColumn(column: ModelColumn): ModelColumn {
  const cloned = cloneValue(column) as ModelColumn;
  const meta = cloned.meta ?? {};
  const {
    max_length: maxLength,
    sample_values: sampleValues,
    filled_percentage: filledPercentage,
    ...rest
  } = meta;
  return {
    ...cloned,
    meta: {
      ...rest,
      ...(maxLength !== undefined ? { source_mx_length: maxLength } : {}),
      ...(sampleValues !== undefined ? { source_sample_values: sampleValues } : {}),
      ...(filledPercentage !== undefined ? { source_filled_percentage: filledPercentage } : {}),
      source_name: column.name,
      ...(column.dataType !== undefined ? { source_datatype: column.dataType } : {}),
    },
  };
}

function cloneRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return value === undefined ? undefined : cloneValue(value) as Record<string, unknown>;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
