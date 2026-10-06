import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterSidebar, type FilterSidebarProps } from '../../../webview-ui/FilterSidebar';

const noop = (): void => undefined;

function props(overrides: Partial<FilterSidebarProps> = {}): FilterSidebarProps {
  return {
    filesByDomain: {
      model: [{ uri: 'models/orders.yml', label: 'orders.yml', domain: 'model', entities: ['model:sample:orders'] }],
      source: [{ uri: 'models/sources.yml', label: 'sources.yml', domain: 'source', entities: ['source:finops:transactions'] }],
    },
    availableEntitiesByDomain: { model: ['model:sample:orders'], source: ['source:finops:transactions'] },
    selectedFilesByDomain: { model: new Set(['models/orders.yml']), source: new Set(['models/sources.yml']) },
    selectedEntitiesByDomain: { model: new Set(['model:sample:orders']), source: new Set(['source:finops:transactions']) },
    searchByDomain: { model: { files: '', entities: '' }, source: { files: '', entities: '' } },
    onFileSearchChange: noop,
    onEntitySearchChange: noop,
    onToggleFile: noop,
    onToggleEntity: noop,
    onSelectAllFiles: noop,
    onClearFiles: noop,
    onSelectAllEntities: noop,
    onClearEntities: noop,
    onRevealEntity: noop,
    onOpenEntitySource: noop,
    sqlModels: new Set(),
    onOpenModelSql: noop,
    onOpenMenu: noop,
    onCollapse: noop,
    showSql: false,
    ...overrides,
  };
}

describe('FilterSidebar', () => {
  it('renders domain groups before their nested subsections', () => {
    const markup = renderToStaticMarkup(createElement(FilterSidebar, props()));
    const titles = [...markup.matchAll(/sidebar__section-title[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(titles).toEqual(['Filter', 'Models', 'Files', 'Models', 'Sources', 'Files', 'Sources']);
    expect(markup).toMatch(/sidebar__domain[^]*>Models[^]*>Files[^]*>Models[^]*sidebar__domain[^]*>Sources[^]*>Files[^]*>Sources/);
  });

  it('shows the empty file-scope message without hiding selected entities', () => {
    const selectedModels = new Set(['model:sample:orders']);
    const markup = renderToStaticMarkup(createElement(FilterSidebar, props({
      availableEntitiesByDomain: { model: [], source: ['source:finops:transactions'] },
      selectedFilesByDomain: { model: new Set(), source: new Set(['models/sources.yml']) },
      selectedEntitiesByDomain: { model: selectedModels, source: new Set(['source:finops:transactions']) },
    })));
    expect(markup).toContain('No files selected');
    expect(markup).not.toContain('>orders</span>');
    expect(selectedModels).toEqual(new Set(['model:sample:orders']));
  });
});
