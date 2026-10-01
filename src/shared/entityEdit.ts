import type { ModelEdit } from '../dbt/edit';
import type { ForeignKeyDescriptor } from '../dbt/types';
import { parseDiagramEntityId, type ParsedDiagramEntityId } from './entityId';

export type RoutedDiagramEdit = { domain: 'model'; edit: ModelEdit } | { domain: 'source'; edit: ModelEdit };
const invalid = (): never => { throw new Error('Cannot edit across diagram entity domains'); };
function editable(id: string): Exclude<ParsedDiagramEntityId, { kind: 'external' }> {
  const parsed = parseDiagramEntityId(id);
  if (parsed === null || parsed.kind === 'external') return invalid();
  return parsed;
}
function raw(parsed: Exclude<ParsedDiagramEntityId, { kind: 'external' }>): string {
  return parsed.kind === 'model' ? parsed.name : `${parsed.sourceName}.${parsed.tableName}`;
}
function sameDomain(left: Exclude<ParsedDiagramEntityId, { kind: 'external' }>, right: Exclude<ParsedDiagramEntityId, { kind: 'external' }>): boolean {
  return left.kind === right.kind && (left.kind !== 'model' || right.kind !== 'model' || left.packageName === right.packageName);
}
function routedFk(fk: ForeignKeyDescriptor, owner: Exclude<ParsedDiagramEntityId, { kind: 'external' }>): ForeignKeyDescriptor {
  if (fk.target === undefined) return fk;
  const target = editable(fk.target);
  if (!sameDomain(owner, target)) return invalid();
  return { ...fk, target: raw(target) };
}
export function routeDiagramEdit(edit: ModelEdit): RoutedDiagramEdit {
  const owner = editable(edit.kind === 'transferColumns' ? edit.sourceModel : edit.model);
  const base = { domain: owner.kind, edit } as const;
  switch (edit.kind) {
    case 'transferColumns': {
      const destination = editable(edit.destinationModel);
      if (!sameDomain(owner, destination)) return invalid();
      return { domain: owner.kind, edit: { ...edit, sourceModel: raw(owner), destinationModel: raw(destination) } };
    }
    case 'createForeignKey': {
      const target = editable(edit.target);
      if (!sameDomain(owner, target)) return invalid();
      return { domain: owner.kind, edit: { ...edit, model: raw(owner), target: raw(target) } };
    }
    case 'setForeignKeyTarget': {
      const target = editable(edit.target);
      if (!sameDomain(owner, target)) return invalid();
      return { domain: owner.kind, edit: { ...edit, model: raw(owner), target: raw(target), fk: routedFk(edit.fk, owner) } };
    }
    case 'setForeignKeyColumns': case 'setForeignKeyVirtual': case 'removeForeignKey':
      return { domain: owner.kind, edit: { ...edit, model: raw(owner), fk: routedFk(edit.fk, owner) } };
    default:
      return { ...base, edit: { ...edit, model: raw(owner) } };
  }
}
