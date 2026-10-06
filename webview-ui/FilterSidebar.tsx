import { useState, type CSSProperties, type ReactNode } from 'react';
import type { DiagramDomain } from '../src/shared/diagramMode';
import { diagramDomainLabels } from '../src/shared/diagramMode';
import { parseDiagramEntityId } from '../src/shared/entityId';
import { matchesSearch } from '../src/shared/filter';
import type { DiagramEntityFile } from '../src/shared/protocol';
import type { ContextMenuItem } from './ContextMenu';
import { FileCode2 } from './icons';
import { useDiagramPresentationMode } from './presentation-mode';

interface CollapsibleSectionProps { title: string; open: boolean; onToggle(): void; count?: string; actions?: ReactNode; variant?: 'filter' | 'domain'; onCollapse?: () => void; children: ReactNode }
function CollapsibleSection({ title, open, onToggle, count, actions, variant, onCollapse, children }: CollapsibleSectionProps): JSX.Element {
  const variantClass = variant === undefined ? '' : ` sidebar__section--${variant}`;
  return <section className={`sidebar__section${variantClass}`}><div className="sidebar__section-header"><button type="button" className="sidebar__section-toggle" aria-expanded={open} onClick={onToggle}><span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" /><span className="sidebar__section-title">{title}</span></button>{actions !== undefined && <span className="sidebar__bulk">{actions}</span>}{count !== undefined && <span className="sidebar__count">{count}</span>}{onCollapse !== undefined && <button type="button" className="sidebar__collapse" title="Hide sidebar" aria-label="Hide sidebar" onClick={onCollapse}><span className="sidebar__chevron" aria-hidden="true" /></button>}</div>{open && <div className="sidebar__section-body">{children}</div>}</section>;
}

type DomainValues<T> = Readonly<Record<DiagramDomain, T>>;
export interface FilterSidebarProps {
  filesByDomain: DomainValues<DiagramEntityFile[]>;
  availableEntitiesByDomain: DomainValues<string[]>;
  selectedFilesByDomain: DomainValues<ReadonlySet<string>>;
  selectedEntitiesByDomain: DomainValues<ReadonlySet<string>>;
  searchByDomain: DomainValues<{ files: string; entities: string }>;
  onFileSearchChange(domain: DiagramDomain, value: string): void;
  onEntitySearchChange(domain: DiagramDomain, value: string): void;
  onToggleFile(domain: DiagramDomain, uri: string, checked: boolean): void;
  onToggleEntity(domain: DiagramDomain, id: string, checked: boolean): void;
  onSelectAllFiles(domain: DiagramDomain): void;
  onClearFiles(domain: DiagramDomain): void;
  onSelectAllEntities(domain: DiagramDomain): void;
  onClearEntities(domain: DiagramDomain): void;
  onRevealEntity(id: string): void;
  onOpenEntitySource(id: string): void;
  sqlModels: ReadonlySet<string>;
  onOpenModelSql(id: string): void;
  onOpenMenu(x: number, y: number, items: ContextMenuItem[]): void;
  onCollapse(): void;
  showSql: boolean;
  style?: CSSProperties;
}

const DOMAINS: readonly DiagramDomain[] = ['model', 'source'];
function entityLabel(id: string): string {
  const parsed = parseDiagramEntityId(id);
  if (parsed === null) return id;
  return parsed.kind === 'source' ? `${parsed.sourceName}.${parsed.tableName}` : parsed.name;
}

export function FilterSidebar(props: FilterSidebarProps): JSX.Element {
  const readOnly = useDiagramPresentationMode() === 'readonly';
  const [filterOpen, setFilterOpen] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({ model: true, modelFiles: true, modelEntities: true, source: true, sourceFiles: true, sourceEntities: true });
  const toggleSection = (key: string): void => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const menuItems = (id: string): ContextMenuItem[] => {
    const kind = parseDiagramEntityId(id)?.kind;
    const selected = kind === 'model' || kind === 'source' ? props.selectedEntitiesByDomain[kind].has(id) : false;
    return [
      { label: 'Reveal in diagram', disabled: !selected, title: selected ? undefined : 'Entity is hidden by the filter', onSelect: () => props.onRevealEntity(id) },
      ...(!readOnly ? [{ label: `Reveal in ${kind === 'source' ? 'source yml' : 'model.yml'}`, onSelect: () => props.onOpenEntitySource(id) }] : []),
      ...(!readOnly && props.showSql && kind === 'model' ? [{ label: 'Open SQL file', icon: <FileCode2 size={16} />, disabled: !props.sqlModels.has(entityLabel(id)), title: props.sqlModels.has(entityLabel(id)) ? undefined : `No .sql file found for "${entityLabel(id)}"`, onSelect: () => props.onOpenModelSql(id) }] : []),
    ];
  };

  return <aside className="sidebar" style={props.style}><CollapsibleSection title="Filter" open={filterOpen} onToggle={() => setFilterOpen((value) => !value)} onCollapse={props.onCollapse} variant="filter">
    {DOMAINS.map((domain) => {
      const labels = diagramDomainLabels(domain);
      const files = props.filesByDomain[domain];
      const entities = props.availableEntitiesByDomain[domain];
      const selectedFiles = props.selectedFilesByDomain[domain];
      const selectedEntities = props.selectedEntitiesByDomain[domain];
      const visibleFiles = files.filter((file) => matchesSearch(file.label, props.searchByDomain[domain].files));
      const visibleEntities = entities.filter((id) => matchesSearch(entityLabel(id), props.searchByDomain[domain].entities));
      const fileKey = `${domain}Files`; const entityKey = `${domain}Entities`;
      const actions = (all: boolean, none: boolean, onAll: () => void, onNone: () => void, noun: string) => <><button type="button" className="sidebar__bulk-button" aria-label={`Select all ${noun}`} disabled={all} onClick={onAll}>All</button><button type="button" className="sidebar__bulk-button" aria-label={`Clear ${noun} selection`} disabled={none} onClick={onNone}>None</button></>;
      return <CollapsibleSection key={domain} title={labels.entitySection} open={open[domain]} onToggle={() => toggleSection(domain)} variant="domain">
        <div className="sidebar__domain">
        <CollapsibleSection title="Files" count={`${files.filter((file) => selectedFiles.has(file.uri)).length}/${files.length}`} open={open[fileKey]} onToggle={() => toggleSection(fileKey)} actions={actions(files.every((file) => selectedFiles.has(file.uri)), selectedFiles.size === 0, () => props.onSelectAllFiles(domain), () => props.onClearFiles(domain), labels.fileSection.toLowerCase())}>
          <input className="sidebar__search" aria-label={`Search ${labels.fileSection.toLowerCase()}`} placeholder="Search files…" value={props.searchByDomain[domain].files} onChange={(event) => props.onFileSearchChange(domain, event.target.value)} />
          <ul className="sidebar__list">{visibleFiles.map((file) => <li key={file.uri}><label className="sidebar__item"><input type="checkbox" checked={selectedFiles.has(file.uri)} onChange={(event) => props.onToggleFile(domain, file.uri, event.target.checked)} /><span className="sidebar__item-label" title={file.uri}>{file.label}</span></label></li>)}{visibleFiles.length === 0 && <li className="sidebar__empty">No matches</li>}</ul>
        </CollapsibleSection>
        <CollapsibleSection title={labels.entitySection} count={`${entities.filter((id) => selectedEntities.has(id)).length}/${entities.length}`} open={open[entityKey]} onToggle={() => toggleSection(entityKey)} actions={actions(entities.every((id) => selectedEntities.has(id)), entities.every((id) => !selectedEntities.has(id)), () => props.onSelectAllEntities(domain), () => props.onClearEntities(domain), labels.entitySection.toLowerCase())}>
          <input className="sidebar__search" aria-label={`Search ${labels.entitySection.toLowerCase()}`} placeholder={`Search ${labels.entitySection.toLowerCase()}…`} value={props.searchByDomain[domain].entities} onChange={(event) => props.onEntitySearchChange(domain, event.target.value)} />
          <ul className="sidebar__list">{entities.length === 0 && <li className="sidebar__empty">No files selected</li>}{entities.length > 0 && visibleEntities.length === 0 && <li className="sidebar__empty">No matches</li>}{visibleEntities.map((id) => <li key={id} className="sidebar__row" onContextMenu={readOnly ? undefined : (event) => { event.preventDefault(); props.onOpenMenu(event.clientX, event.clientY, menuItems(id)); }}><label className="sidebar__item"><input type="checkbox" checked={selectedEntities.has(id)} onChange={(event) => props.onToggleEntity(domain, id, event.target.checked)} /><span className="sidebar__item-label">{entityLabel(id)}</span></label><button type="button" className="sidebar__more" aria-label={readOnly ? `Reveal ${entityLabel(id)} in diagram` : `Actions for ${entityLabel(id)}`} onClick={(event) => { if (readOnly) props.onRevealEntity(id); else { const rect = event.currentTarget.getBoundingClientRect(); props.onOpenMenu(rect.left, rect.bottom, menuItems(id)); } }}>{readOnly ? '⌖' : '⋯'}</button></li>)}</ul>
        </CollapsibleSection>
        </div>
      </CollapsibleSection>;
    })}
  </CollapsibleSection></aside>;
}
