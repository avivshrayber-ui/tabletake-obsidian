import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
const production = process.argv.includes('production');
const context = await esbuild.context({
  entryPoints: ['src/main.ts'], bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
  format: 'cjs', target: 'es2020', platform: 'browser', logLevel: 'info',
  sourcemap: production ? false : 'inline', minify: production, treeShaking: true, outfile: 'main.js',
});
if (production) { await context.rebuild(); await context.dispose(); }
else await context.watch();
