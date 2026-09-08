export interface SourceRef { source: string; table: string; id: string }

export function sourceTableId(source: string, table: string): string {
  return `${source}.${table}`;
}

export function parseSourceRef(value: string): SourceRef | null {
  const match = /^\s*source\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)\s*$/.exec(value);
  if (match === null) return null;
  const source = match[2];
  const table = match[4];
  return { source, table, id: sourceTableId(source, table) };
}

export function formatSourceRef(id: string): string {
  const dot = id.indexOf('.');
  if (dot <= 0 || dot === id.length - 1) throw new Error(`Invalid source table id "${id}"`);
  return `source('${id.slice(0, dot)}', '${id.slice(dot + 1)}')`;
}
