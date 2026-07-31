import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseModelYml } from '../../src/dbt/parse';
import { serializeModelYml } from '../../src/dbt/serialize';
import type { ModelDefinition } from '../../src/dbt/types';
import { buildDiagram } from '../../src/diagram/graph';
import { disambiguateFileLabels } from '../../src/shared/labels';

const fixtureModelsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/sample-dbt/models',
);

/**
 * Every model.yml under the fixture's models tree, mirroring the extension's
 * recursive discovery (spec 05): the tree contains two files named
 * orders.yml — models/orders.yml and models/staging/orders.yml.
 */
function listModelYmlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listModelYmlFiles(full));
    else if (entry.name.endsWith('.yml')) files.push(full);
  }
  return files;
}

function loadFixtureModels(): ModelDefinition[] {
  const models: ModelDefinition[] = [];
  for (const file of listModelYmlFiles(fixtureModelsDir)) {
    const content = fs.readFileSync(file, 'utf8');
    models.push(...parseModelYml(content, file).models);
  }
  return models;
}

const expectedModelNames = ['customers', 'order_items', 'orders', 'products', 'staging_orders'];

describe('sample fixture (fixtures/sample-dbt)', () => {
  it('parses every model.yml file, including nested ones', () => {
    const names = loadFixtureModels()
      .map((model) => model.name)
      .sort();
    expect(names).toEqual(expectedModelNames);
  });

  it('builds the expected diagram graph', () => {
    const graph = buildDiagram(loadFixtureModels());

    const nodeNames = graph.nodes.map((node) => node.id).sort();
    expect(nodeNames).toEqual(expectedModelNames);

    const edges = graph.edges
      .map(
        (edge) =>
          `${edge.source}.${edge.sourceColumns.join('+')}->${edge.target}.${edge.targetColumns.join('+')}`,
      )
      .sort();
    expect(edges).toEqual([
      'order_items.order_id+customer_id->orders.order_id+customer_id',
      'order_items.product_id->products.product_id',
      'orders.customer_id->customers.customer_id',
      'staging_orders.order_id->orders.order_id',
    ]);
  });

  it('labels the two same-named model.yml files with their folder (spec 05)', () => {
    const files = listModelYmlFiles(fixtureModelsDir);
    const root = path.resolve(fixtureModelsDir, '..'); // fixtures/sample-dbt

    const labels = disambiguateFileLabels(files, root);

    const ordersFiles = files.filter((file) => path.basename(file) === 'orders.yml');
    expect(ordersFiles).toHaveLength(2);

    const labelsForOrders = ordersFiles
      .map(
        (file) =>
          `${path.relative(root, file).split(path.sep).join('/')} -> ${labels.get(file)}`,
      )
      .sort();
    expect(labelsForOrders).toEqual([
      'models/orders.yml -> models/orders.yml',
      'models/staging/orders.yml -> staging/orders.yml',
    ]);
  });

  it('round trips every fixture file losslessly', () => {
    for (const file of listModelYmlFiles(fixtureModelsDir)) {
      const content = fs.readFileSync(file, 'utf8');
      const parsed = parseModelYml(content, file);
      expect(parseModelYml(serializeModelYml(parsed), file)).toEqual(parsed);
    }
  });
});
