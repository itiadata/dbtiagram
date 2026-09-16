import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseStaticCliArguments, resolveStaticGeneratorOptions } from '../../../src/static/config';

describe('static generator config', () => {
  it('uses documented defaults', async () => { const result = await resolveStaticGeneratorOptions(parseStaticCliArguments(['--project', 'p', '--output', 'o']), async () => null); expect(result).toMatchObject({ project: path.resolve('p'), output: path.resolve('o'), layoutGlob: '**/*.dbtiagram.yml', initialSelectionLimit: 100 }); });
  it('applies config then CLI overrides', async () => { const args = parseStaticCliArguments(['--project', 'p', '--output', 'o', '--initial-selection-limit', '12']); const result = await resolveStaticGeneratorOptions(args, async () => 'version: 1\nlayoutGlob: diagrams/**\ninitialSelectionLimit: 40\n'); expect(result).toMatchObject({ layoutGlob: 'diagrams/**', initialSelectionLimit: 12 }); });
  it('rejects invalid arguments and config', async () => { expect(() => parseStaticCliArguments(['--project', 'p'])).toThrow('--output'); await expect(resolveStaticGeneratorOptions({ project: 'p', output: 'o' }, async () => 'version: 2\n')).rejects.toThrow('version must be 1'); });
});
