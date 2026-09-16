import { promises as fs } from 'fs';
import * as path from 'path';
import type { StaticGeneratorOptions } from './config';
import { matchesGlob, normalizePathForGlob } from '../shared/glob';

export const STATIC_MODEL_SOURCE_GLOB = '**/models/**/*.yml';
export interface StaticInputFile { relativePath: string; text: string }
export interface StaticProjectInputs { projectRoot: string; yamlFiles: StaticInputFile[]; layoutFiles: StaticInputFile[] }

export async function loadStaticProjectInputs(options: StaticGeneratorOptions): Promise<StaticProjectInputs> {
  const projectRoot = await fs.realpath(options.project);
  const output = path.resolve(options.output);
  const paths: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || path.resolve(full) === output) continue;
        await visit(full);
      } else if (entry.isFile()) paths.push(full);
    }
  };
  await visit(projectRoot);
  const relative = paths.map((full) => ({ full, relativePath: normalizePathForGlob(path.relative(projectRoot, full)) }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const layoutPaths = relative.filter((file) => matchesGlob(file.relativePath, options.layoutGlob));
  const layoutSet = new Set(layoutPaths.map((file) => file.relativePath));
  const yamlPaths = relative.filter((file) => matchesGlob(file.relativePath, STATIC_MODEL_SOURCE_GLOB) && !layoutSet.has(file.relativePath));
  const read = async (file: { full: string; relativePath: string }): Promise<StaticInputFile> => {
    try { return { relativePath: file.relativePath, text: await fs.readFile(file.full, 'utf8') }; }
    catch (error) { throw new Error(`${file.relativePath}: ${String(error)}`); }
  };
  return { projectRoot, yamlFiles: await Promise.all(yamlPaths.map(read)), layoutFiles: await Promise.all(layoutPaths.map(read)) };
}
