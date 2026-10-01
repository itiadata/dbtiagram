/** Stable collision-safe identities shared by every diagram domain. */
export type DiagramEntityId =
  | `model:${string}:${string}`
  | `source:${string}:${string}`
  | `external:${string}:${string}`;
export type DiagramEntityKind = 'model' | 'source' | 'external';
export type ParsedDiagramEntityId =
  | { kind: 'model'; packageName: string; name: string }
  | { kind: 'source'; sourceName: string; tableName: string }
  | { kind: 'external'; packageName: string; name: string };

function component(value: string): string {
  if (value.length === 0 || value.includes(':')) throw new Error('Diagram entity ID components must be non-empty and cannot contain colons');
  return value;
}
export function modelEntityId(packageName: string, modelName: string): DiagramEntityId { return `model:${component(packageName)}:${component(modelName)}`; }
export function sourceEntityId(sourceName: string, tableName: string): DiagramEntityId { return `source:${component(sourceName)}:${component(tableName)}`; }
export function externalEntityId(packageName: string, modelName: string): DiagramEntityId { return `external:${component(packageName)}:${component(modelName)}`; }
export function parseDiagramEntityId(id: string): ParsedDiagramEntityId | null {
  const parts = id.split(':');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  const [kind, owner, name] = parts;
  if (kind === 'model') return { kind, packageName: owner, name };
  if (kind === 'source') return { kind, sourceName: owner, tableName: name };
  if (kind === 'external') return { kind, packageName: owner, name };
  return null;
}
