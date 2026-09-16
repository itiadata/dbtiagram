import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DiagramPresentationProvider, useDiagramPresentationMode } from '../../../webview-ui/presentation-mode';
import { ForeignKeySection } from '../../../webview-ui/ForeignKeySection';
import type { TableNode } from '../../../src/diagram/graph';
function Probe(): JSX.Element { return createElement('span', null, useDiagramPresentationMode()); }
describe('read-only components', () => { it('provides explicit read-only presentation without changing the edit default', () => { expect(renderToStaticMarkup(createElement(Probe))).toContain('edit'); expect(renderToStaticMarkup(createElement(DiagramPresentationProvider, { mode: 'readonly', children: createElement(Probe) }))).toContain('readonly'); }); });

describe('read-only foreign keys', () => {
  it('renders foreign keys with the shared card structure', () => {
    const parent: TableNode = { id: 'orders', label: 'orders', columns: [{ name: 'customer_id' }], foreignKeys: [{ target: 'customers', to: "ref('customers')", columns: ['customer_id'], toColumns: ['id'], virtual: false }], foreignKeyColumns: ['customer_id'] };
    const target: TableNode = { id: 'customers', label: 'customers', columns: [{ name: 'id' }], foreignKeys: [], foreignKeyColumns: [] };
    const noop = (): void => undefined;
    const markup = renderToStaticMarkup(createElement(DiagramPresentationProvider, { mode: 'readonly', children: createElement(ForeignKeySection, { node: parent, nodes: [parent, target], focusedFk: null, drafts: [], onEdit: noop, onAddDraft: noop, onRemoveDraft: noop, onDraftVirtualChange: noop, onDraftAddPair: noop, onRemoveLastPair: noop }) }));
    expect(markup).toContain('fk-card');
    expect(markup).toContain('fk-pair');
    expect(markup).toContain('customer_id');
    expect(markup).toContain('customers');
    expect(markup).toContain('Real');
    expect(markup).not.toContain('combobox');
    expect(markup).not.toContain('Remove');
    expect(markup).not.toContain('Add pair');
  });
});
