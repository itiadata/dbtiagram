import { useState } from 'react';
import { buildStaticMenu, type StaticDiagramRoute, type StaticSiteData } from '../src/shared/staticSite';

export interface DiagramMenuProps { data: StaticSiteData; onOpen: (route: StaticDiagramRoute) => void }
export function DiagramMenu({ data, onOpen }: DiagramMenuProps): JSX.Element {
  const [query, setQuery] = useState('');
  const entries = buildStaticMenu(data, query);
  const explorers = entries.filter((entry) => entry.kind === 'explorer');
  const layouts = entries.filter((entry) => entry.kind === 'layout');
  return <main className="static-menu"><h1>dbt Diagram</h1><input aria-label="Search diagrams" placeholder="Search diagrams…" value={query} onChange={(event) => setQuery(event.target.value)} />
    {data.universe === undefined && data.layouts.length === 0 && <p>No model or source definitions found.</p>}
    <MenuSection title="Explore" entries={explorers} onOpen={onOpen} />
    <MenuSection title="Diagrams" entries={layouts} onOpen={onOpen} />
  </main>;
}
function MenuSection({ title, entries, onOpen }: { title: string; entries: ReturnType<typeof buildStaticMenu>; onOpen: (route: StaticDiagramRoute) => void }): JSX.Element | null {
  if (entries.length === 0) return null;
  return <section><h2>{title}</h2><ul>{entries.map((entry) => <li key={entry.route}><button type="button" onClick={() => onOpen(entry.route)}><strong>{entry.title}</strong>{entry.detail !== undefined && <span>{entry.detail}</span>}</button></li>)}</ul></section>;
}
