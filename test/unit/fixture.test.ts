import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseModelYml } from '../../src/dbt/parse';
import type { ModelDefinition } from '../../src/dbt/types';
import { buildDiagram } from '../../src/diagram/graph';

const fixtureModelsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/sample-dbt/models',
);

function loadFixtureModels(): ModelDefinition[] {
  const models: ModelDefinition[] = [];
  const files = fs.readdirSync(fixtureModelsDir).filter((file) => file.endsWith('.yml'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(fixtureModelsDir, file), 'utf8');
    models.push(...parseModelYml(content, file).models);
  }
  return models;
}

describe('sample fixture (fixtures/sample-dbt)', () => {
  it('parses every model.yml file', () => {
    const names = loadFixtureModels()
      .map((model) => model.name)
      .sort();
    expect(names).toEqual(['customers', 'order_items', 'orders', 'products']);
  });

  it('builds the expected diagram graph', () => {
    const graph = buildDiagram(loadFixtureModels());

    const nodeNames = graph.nodes.map((node) => node.id).sort();
    expect(nodeNames).toEqual(['customers', 'order_items', 'orders', 'products']);

    const edges = graph.edges
      .map((edge) => `${edge.source}->${edge.target}`)
      .sort();
    expect(edges).toEqual([
      'order_items->orders',
      'order_items->products',
      'orders->customers',
    ]);
  });
});
