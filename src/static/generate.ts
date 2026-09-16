import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { StaticGeneratorOptions } from './config';
import { loadStaticProjectInputs } from './project';
import { buildStaticSite, type StaticSiteWarning } from './site';
import { serializeStaticSiteData } from '../shared/staticSite';

export interface GenerateStaticSiteResult {
  indexPath: string;
  modelExplorerCount: 0 | 1;
  sourceExplorerCount: 0 | 1;
  modelLayoutCount: number;
  sourceLayoutCount: number;
  warnings: StaticSiteWarning[];
}

export async function generateStaticSite(options: StaticGeneratorOptions): Promise<GenerateStaticSiteResult> {
  const inputs = await loadStaticProjectInputs(options);
  const built = buildStaticSite(inputs, options.initialSelectionLimit);
  const artifactDirectory = __dirname;
  const javascript = await fs.readFile(path.join(artifactDirectory, 'app.js'));
  const stylesheet = await fs.readFile(path.join(artifactDirectory, 'app.css'));
  const jsName = assetName('js', javascript);
  const cssName = assetName('css', stylesheet);
  const html = htmlDocument(serializeStaticSiteData(built.data), jsName, cssName);
  const parent = path.dirname(options.output);
  await fs.mkdir(parent, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(parent, '.dbtiagram-static-'));
  try {
    await fs.mkdir(path.join(temporary, 'assets'));
    await Promise.all([
      fs.writeFile(path.join(temporary, 'index.html'), html),
      fs.writeFile(path.join(temporary, 'assets', jsName), javascript),
      fs.writeFile(path.join(temporary, 'assets', cssName), stylesheet),
    ]);
    await fs.mkdir(path.join(options.output, 'assets'), { recursive: true });
    const existingAssets = await fs.readdir(path.join(options.output, 'assets'));
    await Promise.all(existingAssets.filter((name) => name.startsWith('dbtiagram-app-')).map((name) => fs.rm(path.join(options.output, 'assets', name), { force: true })));
    await fs.copyFile(path.join(temporary, 'index.html'), path.join(options.output, 'index.html'));
    await fs.copyFile(path.join(temporary, 'assets', jsName), path.join(options.output, 'assets', jsName));
    await fs.copyFile(path.join(temporary, 'assets', cssName), path.join(options.output, 'assets', cssName));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return {
    indexPath: path.join(options.output, 'index.html'),
    modelExplorerCount: built.data.model === undefined ? 0 : 1,
    sourceExplorerCount: built.data.source === undefined ? 0 : 1,
    modelLayoutCount: built.data.layouts.filter((entry) => entry.layout.mode === 'model').length,
    sourceLayoutCount: built.data.layouts.filter((entry) => entry.layout.mode === 'source').length,
    warnings: built.warnings,
  };
}

function assetName(extension: 'js' | 'css', content: Buffer): string {
  return `dbtiagram-app-${createHash('sha256').update(content).digest('hex').slice(0, 12)}.${extension}`;
}
function htmlDocument(data: string, javascript: string, stylesheet: string): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dbt Diagram</title><link rel="stylesheet" href="assets/${stylesheet}"></head><body><div id="root"></div><script id="dbtiagram-data" type="application/json">${data}</script><script src="assets/${javascript}"></script></body></html>\n`;
}
