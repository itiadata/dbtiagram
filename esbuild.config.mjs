import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const contexts = [
  await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    outfile: path.join(__dirname, 'dist', 'extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: true,
    external: ['vscode'],
    logLevel: 'info',
  }),
  await esbuild.context({
    entryPoints: [path.join(__dirname, 'webview-ui', 'index.tsx')],
    outfile: path.join(__dirname, 'dist', 'webview', 'app.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    sourcemap: true,
    loader: { '.css': 'css' },
    logLevel: 'info',
  }),
];

async function main() {
  for (const ctx of contexts) {
    if (watch) {
      await ctx.watch();
    } else {
      await ctx.rebuild();
      await ctx.dispose();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
