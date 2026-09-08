import { expect, it } from 'vitest';
import { findSourceColumnDeclaration, findSourceTableDeclaration } from '../../../src/dbt/sourceLocate';
const text = 'sources:\n  - name: finops\n    tables:\n      - name: costs\n        columns:\n          - name: id\n';
it('locates a nested source table and column', () => {
  expect(findSourceTableDeclaration(text, 'finops', 'costs')).toEqual({ line: 3, column: 14, length: 5 });
  expect(findSourceColumnDeclaration(text, 'finops', 'costs', 'id')).toEqual({ line: 5, column: 18, length: 2 });
});
