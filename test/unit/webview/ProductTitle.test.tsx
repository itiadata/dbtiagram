import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductTitle } from '../../../webview-ui/ProductTitle';

describe('ProductTitle', () => {
  it('renders the version directly below the product name', () => {
    expect(renderToStaticMarkup(<ProductTitle version="0.0.2" />)).toBe(
      '<div class="app__product"><h1>dbt Diagram</h1><span class="app__version">v0.0.2</span></div>',
    );
  });

  it('omits the version until supplied by the host', () => {
    expect(renderToStaticMarkup(<ProductTitle version={null} />)).toBe(
      '<div class="app__product"><h1>dbt Diagram</h1></div>',
    );
  });
});
