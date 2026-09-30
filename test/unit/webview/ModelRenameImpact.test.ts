import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelRenameImpactDialog } from '../../../webview-ui/ModelRenameImpact';

describe('ModelRenameImpactDialog', () => {
  it('renders rename impact and OK action', () => {
    const markup = renderToStaticMarkup(createElement(ModelRenameImpactDialog, {
      impact: { oldName: 'orders', newName: 'sales_orders', updatedFiles: ['/project/schema.yml', '/project/orders.sql'], sqlRename: { from: '/project/orders.sql', to: '/project/sales_orders.sql' } },
      onClose: () => undefined,
    }));
    expect(markup).toContain('Renamed orders to sales_orders');
    expect(markup).toContain('/project/schema.yml'); expect(markup).toContain('/project/orders.sql');
    expect(markup).toContain('Renamed:'); expect(markup).toContain('/project/sales_orders.sql'); expect(markup).toContain('OK');
  });
});
