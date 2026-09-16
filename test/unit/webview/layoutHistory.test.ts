import { describe, expect, it } from 'vitest';
import type { DiagramLayout } from '../../../src/diagram/layoutFile';
import { beginLayoutCapture, finishLayoutCapture } from '../../../webview-ui/layout-history';

const value = (x: number): DiagramLayout => ({ version: 2, mode: 'model', name: 'x', tables: [{ name: 'orders', x, y: 20 }], notes: [], groups: [] });

describe('layout history capture', () => {
  it('captures one completed changed layout', () => expect(finishLayoutCapture(beginLayoutCapture('Move table orders', value(10)), value(300))).toEqual({ label: 'Move table orders', before: value(10), after: value(300) }));
  it('ignores an unchanged gesture', () => expect(finishLayoutCapture(beginLayoutCapture('Move', value(10)), value(10))).toBeNull());
});
