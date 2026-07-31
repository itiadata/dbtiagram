import { describe, expect, it } from 'vitest';
import { disambiguateFileLabels } from '../../../src/shared/labels';

describe('disambiguateFileLabels', () => {
  it('returns an empty map for no paths', () => {
    expect(disambiguateFileLabels([]).size).toBe(0);
  });

  it('uses the bare file name when basenames are unique', () => {
    const labels = disambiguateFileLabels([
      'C:/repo/models/orders.yml',
      'C:/repo/models/order_items.yml',
      'C:/repo/models/products.yml',
    ]);
    expect(labels.get('C:/repo/models/orders.yml')).toBe('orders.yml');
    expect(labels.get('C:/repo/models/order_items.yml')).toBe('order_items.yml');
    expect(labels.get('C:/repo/models/products.yml')).toBe('products.yml');
  });

  it('disambiguates duplicate basenames with the shortest unique path suffix', () => {
    const labels = disambiguateFileLabels([
      'C:/repo/marts/orders.yml',
      'C:/repo/staging/orders.yml',
    ]);
    expect(labels.get('C:/repo/marts/orders.yml')).toBe('marts/orders.yml');
    expect(labels.get('C:/repo/staging/orders.yml')).toBe('staging/orders.yml');
  });

  it('lengthens the suffix while basenames still collide', () => {
    const labels = disambiguateFileLabels([
      'C:/repo/a/models/orders.yml',
      'C:/repo/b/models/orders.yml',
    ]);
    expect(labels.get('C:/repo/a/models/orders.yml')).toBe('a/models/orders.yml');
    expect(labels.get('C:/repo/b/models/orders.yml')).toBe('b/models/orders.yml');
  });

  it('keeps two segments when the first folder level also collides', () => {
    const labels = disambiguateFileLabels([
      'C:/repo/a/orders.yml',
      'C:/repo/b/orders.yml',
      'C:/repo/b/orders2.yml',
    ]);
    expect(labels.get('C:/repo/a/orders.yml')).toBe('a/orders.yml');
    expect(labels.get('C:/repo/b/orders.yml')).toBe('b/orders.yml');
    expect(labels.get('C:/repo/b/orders2.yml')).toBe('orders2.yml');
  });

  it('normalizes Windows backslashes', () => {
    const labels = disambiguateFileLabels([
      'C:\\repo\\models\\orders.yml',
      'C:\\repo\\models\\order_items.yml',
    ]);
    expect(labels.get('C:\\repo\\models\\orders.yml')).toBe('orders.yml');
    expect(labels.get('C:\\repo\\models\\order_items.yml')).toBe('order_items.yml');
  });

  it('respects an explicit workspace root', () => {
    const labels = disambiguateFileLabels(
      ['C:/repo/marts/orders.yml', 'C:/repo/staging/orders.yml'],
      'C:/repo',
    );
    expect(labels.get('C:/repo/marts/orders.yml')).toBe('marts/orders.yml');
    expect(labels.get('C:/repo/staging/orders.yml')).toBe('staging/orders.yml');
  });

  it('still disambiguates files outside an explicit root via their path', () => {
    const labels = disambiguateFileLabels(
      ['C:/repo/models/orders.yml', 'D:/other/models/orders.yml'],
      'C:/repo',
    );
    expect(labels.get('C:/repo/models/orders.yml')).toBe('models/orders.yml');
    expect(labels.get('D:/other/models/orders.yml')).toBe('other/models/orders.yml');
  });
});
