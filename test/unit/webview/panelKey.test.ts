import { describe, expect, it } from 'vitest';
import {
  diagramPanelKey,
  diagramPanelTitle,
  type DiagramSource,
} from '../../../src/webview/panelKey';

describe('diagramPanelKey', () => {
  it('is stable for the same source', () => {
    const source: DiagramSource = { kind: 'model', fsPath: '/repo/models/core/schema.yml' };
    expect(diagramPanelKey(source, false)).toBe(diagramPanelKey(source, false));
  });

  it('differs for different paths', () => {
    expect(diagramPanelKey({ kind: 'model', fsPath: '/repo/a.yml' }, false)).not.toBe(
      diagramPanelKey({ kind: 'model', fsPath: '/repo/b.yml' }, false),
    );
  });

  it('distinguishes kinds for the same path', () => {
    expect(diagramPanelKey({ kind: 'model', fsPath: '/a/x.yml' }, false)).not.toBe(
      diagramPanelKey({ kind: 'layout', fsPath: '/a/x.yml' }, false),
    );
  });

  it('unifies path separators', () => {
    expect(diagramPanelKey({ kind: 'model', fsPath: 'C:\\repo\\models\\a.yml' }, false)).toBe(
      diagramPanelKey({ kind: 'model', fsPath: 'C:/repo/models/a.yml' }, false),
    );
  });

  it('ignores case only when caseInsensitive is true', () => {
    const lower: DiagramSource = { kind: 'model', fsPath: '/repo/Schema.yml' };
    const upper: DiagramSource = { kind: 'model', fsPath: '/repo/schema.yml' };
    expect(diagramPanelKey(lower, true)).toBe(diagramPanelKey(upper, true));
    expect(diagramPanelKey(lower, false)).not.toBe(diagramPanelKey(upper, false));
  });

  it('gives every adhoc invocation its own key', () => {
    expect(diagramPanelKey({ kind: 'adhoc', id: '1' }, false)).not.toBe(
      diagramPanelKey({ kind: 'adhoc', id: '2' }, false),
    );
  });
});

describe('diagramPanelTitle', () => {
  it('uses the layout name for a layout source', () => {
    expect(diagramPanelTitle({ kind: 'layout', fsPath: '/r/orders.dbtiagram.yml' }, 'orders')).toBe(
      'orders — dbt Diagram',
    );
  });

  it('falls back to the base name minus the layout suffix', () => {
    expect(diagramPanelTitle({ kind: 'layout', fsPath: '/r/finance.dbtiagram.yml' })).toBe(
      'finance — dbt Diagram',
    );
  });

  it('uses the file base name for a model source', () => {
    expect(diagramPanelTitle({ kind: 'model', fsPath: '/r/models/core/schema.yml' })).toBe(
      'schema.yml — dbt Diagram',
    );
  });

  it('handles Windows separators', () => {
    expect(diagramPanelTitle({ kind: 'model', fsPath: 'C:\\r\\models\\schema.yml' })).toBe(
      'schema.yml — dbt Diagram',
    );
  });

  it('uses the plain title for an adhoc source', () => {
    expect(diagramPanelTitle({ kind: 'adhoc', id: '1' })).toBe('dbt Diagram');
  });
});
