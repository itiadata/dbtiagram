import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductTitle, type ProductTitleProps } from '../../../webview-ui/ProductTitle';

function render(overrides: Partial<ProductTitleProps> = {}): string {
  return renderToStaticMarkup(createElement(ProductTitle, {
    version: '0.0.2',
    updateStatus: 'unknown',
    onCheckForUpdates: () => undefined,
    ...overrides,
  }));
}

describe('ProductTitle', () => {
  it('renders the version and parenthesized up-to-date text directly below the product name', () => {
    const markup = render({ updateStatus: 'upToDate' });
    expect(markup).toContain('<span>v0.0.2</span><span> (Up to date)</span>');
    expect(markup).not.toContain('<button');
  });

  it('renders the manual check action for unknown status', () => {
    const markup = render();
    expect(markup).toContain('<button type="button" class="app__update-check">Check for updates</button>');
    expect(markup).not.toContain('Checking...');
  });

  it('renders the available-update action', () => {
    expect(render({ updateStatus: 'updateAvailable' })).toContain(
      '<button type="button" class="app__update-check app__update-check--available">Update available</button>',
    );
  });

  it('omits the version until supplied by the host', () => {
    expect(render({ version: null })).toBe(
      '<div class="app__product"><h1>dbt Diagram</h1></div>',
    );
  });
});
