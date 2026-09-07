import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductTitle } from '../../../webview-ui/ProductTitle';

describe('ProductTitle', () => {
  it('renders the version directly below the product name', () => {
    expect(renderToStaticMarkup(<ProductTitle version="0.0.2" upToDate />)).toBe(
      '<div class="app__product"><h1>dbt Diagram</h1><span class="app__version"><span>v0.0.2</span><span class="app__update-status">Up to date</span></span></div>',
    );
  });

  it('omits the version until supplied by the host', () => {
    expect(renderToStaticMarkup(<ProductTitle version={null} upToDate={false} />)).toBe(
      '<div class="app__product"><h1>dbt Diagram</h1></div>',
    );
  });
});
