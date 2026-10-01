import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { NotAModelYmlFileError, parseModelYml } from '../../src/dbt/parse';
import { parseSourceYml } from '../../src/dbt/sourceParse';
import { findModelDeclaration } from '../../src/dbt/locate';
import { serializeModelYml } from '../../src/dbt/serialize';
import type { ModelDefinition } from '../../src/dbt/types';
import { buildDiagram as buildCombinedDiagram } from '../../src/diagram/graph';
import { applyLayout, isLayoutFilePath, parseDiagramLayout } from '../../src/diagram/layoutFile';
import { disambiguateFileLabels } from '../../src/shared/labels';
import { buildStaticSite } from '../../src/static/site';
import { sqlLineageTargets } from '../../src/diagram/lineage';
import { externalEntityId, modelEntityId, sourceEntityId } from '../../src/shared/entityId';

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
    try { models.push(...parseModelYml(content, file).models); } catch (error) { if (!(error instanceof NotAModelYmlFileError)) throw error; }
  }
  return models;
}

const expectedModelNames = ['customers', 'order_items', 'order_summary', 'orders', 'payments', 'products', 'staging_orders'];
const buildDiagram = (models: ModelDefinition[]) => buildCombinedDiagram(models.map((model) => ({ packageName: 'sample', model })), []);
const buildSourceDiagram = (sources: Parameters<typeof buildCombinedDiagram>[1]) => buildCombinedDiagram([], sources);

function fixtureLineageEdges(): Array<{ parent: string; child: string }> {
  const knownModels = new Set(loadFixtureModels().map((model) => model.name));
  return fs.readdirSync(fixtureModelsDir)
    .filter((name) => name.endsWith('.sql'))
    .flatMap((name) => {
      const childName = name.replace(/\.sql$/i, '');
      const text = fs.readFileSync(path.join(fixtureModelsDir, name), 'utf8');
      return sqlLineageTargets('sample', text).map((target) => ({
        parent: target.kind === 'source'
          ? sourceEntityId(target.sourceName, target.tableName)
          : knownModels.has(target.name) && target.packageName === 'sample'
            ? modelEntityId('sample', target.name)
            : externalEntityId(target.packageName, target.name),
        child: modelEntityId('sample', childName),
      }));
    });
}

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
    expect(nodeNames).toEqual(expectedModelNames.map((name) => `model:sample:${name}`));

    const edges = graph.edges
      .map(
        (edge) =>
          `${edge.source}.${edge.sourceColumns.join('+')}->${edge.target}.${edge.targetColumns.join('+')}${
            edge.virtual ? ' (virtual)' : ''
          }`,
      )
      .sort();
    expect(edges).toEqual([
      'model:sample:order_items.order_id+customer_id->model:sample:orders.order_id+customer_id',
      'model:sample:order_items.product_id->model:sample:products.product_id',
      'model:sample:orders.customer_id->model:sample:customers.customer_id',
      'model:sample:orders.payment_id->model:sample:payments.id',
      'model:sample:products.product_id->model:sample:customers.customer_id (virtual)',
      'model:sample:staging_orders.order_id->model:sample:orders.order_id',
    ]);
  });

  it('reads the virtual PK and virtual FK off the products node (spec 08)', () => {
    const graph = buildDiagram(loadFixtureModels());
    const products = graph.nodes.find((node) => node.id === 'model:sample:products');
    expect(products?.primaryKey).toEqual({
      columns: ['product_id'],
      virtual: true,
      uniqueTest: false,
    });
    expect(products?.foreignKeys).toEqual([
      {
        target: 'model:sample:customers',
        to: "ref('customers')",
        columns: ['product_id'],
        toColumns: ['customer_id'],
        virtual: true,
      },
    ]);
    // orders keeps its real PK from the fixtures.
    const orders = graph.nodes.find((node) => node.id === 'model:sample:orders');
    expect(orders?.primaryKey).toEqual({
      columns: ['order_id'],
      virtual: false,
      uniqueTest: true,
    });
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
      try {
        const parsed = parseModelYml(content, file);
        expect(parseModelYml(serializeModelYml(parsed), file)).toEqual(parsed);
      } catch (error) { if (!(error instanceof NotAModelYmlFileError)) throw error; }
    }
  });

  it('parses the sample saved diagram and only names existing models (spec 13)', () => {
    const layoutPath = path.resolve(fixtureModelsDir, '../diagrams/orders.dbtiagram.yml');
    const layout = parseDiagramLayout(fs.readFileSync(layoutPath, 'utf8'), 'orders');

    expect(layout.name).toBe('orders');
    expect(layout.tables.length).toBeGreaterThan(0);

    const known = new Set(loadFixtureModels().map((model) => `model:sample:${model.name}`));
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
      let parsed;
      try { parsed = parseModelYml(content, file); } catch (error) { if (error instanceof NotAModelYmlFileError) continue; throw error; }
      for (const model of parsed.models) {
        const position = findModelDeclaration(content, model.name);
        expect(position, `${file}: ${model.name}`).not.toBeNull();
        expect(lines[position?.line ?? 0]).toContain(model.name);
      }
    }
  });

  it('loads the source fixture end to end', () => {
    const file = path.resolve(fixtureModelsDir, 'sources/finops.yml');
    const source = parseSourceYml(fs.readFileSync(file, 'utf8'), file);
    const graph = buildSourceDiagram(source.sources);
    expect(graph.nodes.map((node) => node.id)).toEqual(['source:finops:costs', 'source:finops:workspaces', 'source:finops:transactions', 'source:finops:staging_orders']);
    expect(graph.edges[0]).toMatchObject({ source: 'source:finops:costs', target: 'source:finops:workspaces', virtual: true });
  });

  it('keeps source/model lineage separate from FKs', () => {
    const graph = buildDiagram(loadFixtureModels());
    const fkPairs = new Set(graph.edges.map((edge) => [edge.source, edge.target].sort().join('\0')));
    const sourceModelOverlaps = fixtureLineageEdges().filter(
      (edge) => edge.parent.startsWith('source:') && fkPairs.has([edge.parent, edge.child].sort().join('\0')),
    );
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'model:sample:orders', target: 'model:sample:payments' }));
    expect(sourceModelOverlaps).toEqual([]);
  });

  it('loads source and external fixture lineage', () => {
    expect(fixtureLineageEdges()).toEqual(expect.arrayContaining([
      { parent: 'source:finops:staging_orders', child: 'model:sample:payments' },
      { parent: 'source:finops:staging_orders', child: 'model:sample:orders' },
      { parent: 'external:finance_pkg:dim_currency', child: 'model:sample:order_summary' },
    ]));
  });

  it('carries column test names into the diagram graph (spec 30)', () => {
    const graph = buildDiagram(loadFixtureModels());

    const customers = graph.nodes.find((n) => n.id === 'model:sample:customers')!;
    const email = customers.columns.find((c) => c.name === 'email')!;
    // email has unique + not_null + accepted_values; PK-owned not_null excluded for customer_id
    expect(email.tests).toEqual(['unique', 'not_null', 'accepted_values']);

    // customer_id is the real PK; its only test is not_null (PK-owned), so no tests field
    const customerId = customers.columns.find((c) => c.name === 'customer_id')!;
    expect(customerId.tests).toBeUndefined();

    const orderItems = graph.nodes.find((n) => n.id === 'model:sample:order_items')!;
    const quantity = orderItems.columns.find((c) => c.name === 'quantity')!;
    expect(quantity.tests).toEqual(['not_null', 'dbt_utils.accepted_range']);

    const products = graph.nodes.find((n) => n.id === 'model:sample:products')!;
    const productName = products.columns.find((c) => c.name === 'name')!;
    expect(productName.tests).toEqual(['not_null', 'unique']);
  });

  it('generates static site data from the sample dbt project', () => {
    const root = path.resolve(fixtureModelsDir, '..');
    const yamlFiles = listModelYmlFiles(fixtureModelsDir).map((file) => ({
      relativePath: path.relative(root, file).split(path.sep).join('/'),
      text: fs.readFileSync(file, 'utf8'),
    }));
    const diagrams = path.join(root, 'diagrams');
    const layoutFiles = fs.readdirSync(diagrams).filter((name) => name.endsWith('.dbtiagram.yml')).map((name) => ({ relativePath: `diagrams/${name}`, text: fs.readFileSync(path.join(diagrams, name), 'utf8') }));
    const sqlFiles = fs.readdirSync(fixtureModelsDir).filter((name) => name.endsWith('.sql')).map((name) => ({ relativePath: `models/${name}`, text: fs.readFileSync(path.join(fixtureModelsDir, name), 'utf8') }));
    const built = buildStaticSite({ projectRoot: root, packageName: 'sample', yamlFiles, sqlFiles, layoutFiles }, 100);
    expect(built.data.universe?.graph.nodes.some((node) => node.entityKind === 'model')).toBe(true);
    expect(built.data.universe?.graph.nodes.some((node) => node.entityKind === 'source')).toBe(true);
    expect(built.data.universe?.graph.lineageEdges).toEqual(expect.arrayContaining([
      { parent: 'source:finops:staging_orders', child: 'model:sample:payments' },
      { parent: 'source:finops:staging_orders', child: 'model:sample:orders' },
    ]));
    expect(built.warnings).toEqual([]);
  });
});
