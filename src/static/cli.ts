import { promises as fs } from 'fs';
import { generateStaticSite } from './generate';
import { parseStaticCliArguments, resolveStaticGeneratorOptions } from './config';

async function main(): Promise<void> {
  const args = parseStaticCliArguments(process.argv.slice(2));
  const options = await resolveStaticGeneratorOptions(args, async (filePath) => {
    try { return await fs.readFile(filePath, 'utf8'); }
    catch (error) { if (isNotFound(error)) return null; throw error; }
  });
  const result = await generateStaticSite(options);
  for (const warning of result.warnings) console.warn(`Warning: ${warning.path}: missing tables ${warning.tables.join(', ')}`);
  console.log(`Generated ${result.indexPath} (${result.modelExplorerCount} model explorers, ${result.sourceExplorerCount} source explorers, ${result.modelLayoutCount} model layouts, ${result.sourceLayoutCount} source layouts, ${result.warnings.length} warnings)`);
}
function isNotFound(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'; }
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
