import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { loadStaticProjectInputs } from '../../../src/static/project';

describe('static project loader', () => {
  it('discovers sorted project-relative inputs', async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbtiagram-')); try { await fs.mkdir(path.join(root, 'models', 'z'), { recursive: true }); await fs.mkdir(path.join(root, 'diagrams')); await fs.writeFile(path.join(root, 'models', 'z', 'b.yml'), 'models: []'); await fs.writeFile(path.join(root, 'models', 'a.yml'), 'models: []'); await fs.writeFile(path.join(root, 'diagrams', 'x.dbtiagram.yml'), 'version: 2'); const result = await loadStaticProjectInputs({ project: root, output: path.join(root, 'out'), config: path.join(root, 'dbtiagram.config.yml'), layoutGlob: '**/*.dbtiagram.yml', initialSelectionLimit: 100 }); expect(result.yamlFiles.map((file) => file.relativePath)).toEqual(['models/a.yml', 'models/z/b.yml']); expect(result.layoutFiles.map((file) => file.relativePath)).toEqual(['diagrams/x.dbtiagram.yml']); } finally { await fs.rm(root, { recursive: true, force: true }); } });
});
