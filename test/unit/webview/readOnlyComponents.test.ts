import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DiagramPresentationProvider, useDiagramPresentationMode } from '../../../webview-ui/presentation-mode';
function Probe(): JSX.Element { return createElement('span', null, useDiagramPresentationMode()); }
describe('read-only components', () => { it('provides explicit read-only presentation without changing the edit default', () => { expect(renderToStaticMarkup(createElement(Probe))).toContain('edit'); expect(renderToStaticMarkup(createElement(DiagramPresentationProvider, { mode: 'readonly', children: createElement(Probe) }))).toContain('readonly'); }); });
