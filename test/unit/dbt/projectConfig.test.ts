import { describe, expect, it } from 'vitest';
import { parseDbtProjectConfig } from '../../../src/dbt/projectConfig';

describe('dbt project config', () => {
  it('uses dbt path defaults', () => {
    expect(parseDbtProjectConfig('name: sample')).toEqual({
      name: 'sample', modelPaths: ['models'], macroPaths: ['macros'],
      testPaths: ['tests'], snapshotPaths: ['snapshots'],
    });
  });

  it('reads configured path arrays', () => {
    expect(parseDbtProjectConfig(`name: sample\nmodel-paths: [m]\nmacro-paths: [x]\ntest-paths: [t]\nsnapshot-paths: [s]`)).toEqual({
      name: 'sample', modelPaths: ['m'], macroPaths: ['x'], testPaths: ['t'], snapshotPaths: ['s'],
    });
  });
});
