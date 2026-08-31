import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseModelYml } from '../../src/dbt/parse';
import { findModelDeclaration } from '../../src/dbt/locate';
import { serializeModelYml } from '../../src/dbt/serialize';
import type { ModelDefinition } from '../../src/dbt/types';
import { buildDiagram } from '../../src/diagram/graph';
import { applyLayout, isLayoutFilePath, parseDiagramLayout } from '../../src/diagram/layoutFile';
import { disambiguateFileLabels } from '../../src/shared/labels';

const fixtureModelsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/sample-dbt/models',
);

/**
 * Every model.yml under the fixture's models tree, mirroring the extension's
 * recursive discovery (spec 05): the tree contains two files named
 * orders.yml �?" models/orders.yml and models/staging/orders.yml. Saved diagram
 * layouts are skipped exactly as `loadModelYmlFiles` skips them (spec 13), so a
 * layout saved under models/ never breaks model parsing.
 */
function listModelYmlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listModelYmlFiles(full));
    else if (entry.name.endsWith('.yml') && !isLayoutFilePath(full)) files.push(full);
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
          `${edge.source}.${edge.sourceColumns.join('+')}->${edge.target}.${edge.targetColumns.join('+')}${
            edge.virtual ? ' (virtual)' : ''
          }`,
      )
      .sort();
    expect(edges).toEqual([
      'order_items.order_id+customer_id->orders.order_id+customer_id',
      'order_items.product_id->products.product_id',
      'orders.customer_id->customers.customer_id',
      'products.product_id->customers.customer_id (virtual)',
      'staging_orders.order_id->orders.order_id',
    ]);
  });

  it('reads the virtual PK and virtual FK off the products node (spec 08)', () => {
    const graph = buildDiagram(loadFixtureModels());
    const products = graph.nodes.find((node) => node.id === 'products');
    expect(products?.primaryKey).toEqual({ columns: ['product_id'], virtual: true });
    expect(products?.foreignKeys).toEqual([
      {
        target: 'customers',
        to: "ref('customers')",
        columns: ['product_id'],
        toColumns: ['customer_id'],
        virtual: true,
      },
    ]);
    // orders keeps its real PK from the fixtures.
    const orders = graph.nodes.find((node) => node.id === 'orders');
    expect(orders?.primaryKey).toEqual({ columns: ['order_id'], virtual: false });
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

  it('parses the sample saved diagram and only names existing models (spec 13)', () => {
    const layoutPath = path.resolve(fixtureModelsDir, '../diagrams/orders.dbtiagram.yml');
    const layout = parseDiagramLayout(fs.readFileSync(layoutPath, 'utf8'), 'orders');

    expect(layout.name).toBe('orders');
    expect(layout.tables.length).toBeGreaterThan(0);

    const known = new Set(loadFixtureModels().map((model) => model.name));
    expect(applyLayout(layout, known).missing).toEqual([]);
  });

  it('the fixture diagram notes parse with sane values (spec 16)', () => {
    const layoutPath = path.resolve(fixtureModelsDir, '../diagrams/orders.dbtiagram.yml');
    const layout = parseDiagramLayout(fs.readFileSync(layoutPath, 'utf8'), 'orders');

    expect(layout.notes).toHaveLength(2);
    for (const note of layout.notes) {
      expect(note.id).not.toBe('');
      expect(note.width).toBeGreaterThanOrEqual(120);
      expect(note.height).toBeGreaterThanOrEqual(64);
    }
    expect(layout.notes.filter((note) => note.collapsedByDefault)).toHaveLength(1);
  });

  it('every fixture model is locatable in its own file (spec 15)', () => {
    for (const file of listModelYmlFiles(fixtureModelsDir)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const model of parseModelYml(content, file).models) {
        const position = findModelDeclaration(content, model.name);
        expect(position, `${file}: ${model.name}`).not.toBeNull();
        expect(lines[position?.line ?? 0]).toContain(model.name);
      }
    }
  });

  it('carries column test names into the diagram graph (spec 30)', () => {
    const graph = buildDiagram(loadFixtureModels());

    const customers = graph.nodes.find((n) => n.id === 'customers')!;
    const email = customers.columns.find((c) => c.name === 'email')!;
    // email has unique + not_null + accepted_values; PK-owned not_null excluded for customer_id
    expect(email.tests).toEqual(['unique', 'not_null', 'accepted_values']);

    // customer_id is the real PK; its only test is not_null (PK-owned), so no tests field
    const customerId = customers.columns.find((c) => c.name === 'customer_id')!;
    expect(customerId.tests).toBeUndefined();

    const orderItems = graph.nodes.find((n) => n.id === 'order_items')!;
    const quantity = orderItems.columns.find((c) => c.name === 'quantity')!;
    expect(quantity.tests).toEqual(['not_null', 'dbt_utils.accepted_range']);

    const products = graph.nodes.find((n) => n.id === 'products')!;
    const productName = products.columns.find((c) => c.name === 'name')!;
    expect(productName.tests).toEqual(['not_null', 'unique']);
  });
});
