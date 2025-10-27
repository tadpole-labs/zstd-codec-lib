import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { compressFiles } from './util.js';
import { build } from 'esbuild';
import { minify } from 'terser';

const __dirname = import.meta.dirname || process.cwd();
const dataDir = join(__dirname, '../data');
const warmupDir = join(__dirname, '../edge-cases/golden-compression');
const outputDir = join(__dirname, 'compressed');
const outfile = join(__dirname, 'bench-min.js');

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

const dataFiles = readdirSync(dataDir).filter(f => !f.startsWith('.'));
const needsCompression = !dataFiles.every((_, idx) => existsSync(join(outputDir, `test-${idx}.zst`)));

if (needsCompression) {
  const testFiles = await compressFiles(dataDir, true);
  testFiles.forEach((file, idx) => writeFileSync(join(outputDir, `test-${idx}.zst`), file.compressed));
  writeFileSync(join(outputDir, 'metadata.json'), JSON.stringify({
    fileSizes: testFiles.map(f => f.original.length),
    levels: testFiles.map(f => f.level),
    fileCount: testFiles.length,
    totalOriginalSize: testFiles.reduce((sum, f) => sum + f.original.length, 0)
  }));
}

const warmupFiles = await compressFiles(warmupDir, false);
warmupFiles.forEach((file, idx) => writeFileSync(join(outputDir, `warmup-${idx}.zst`), file.compressed));

copyFileSync(join(__dirname, '../../packages/zstd-wasm-decoder/src/zstd-decoder.wasm'), join(__dirname, 'zstd-decoder.wasm'));

await build({
  entryPoints: [join(__dirname, 'bench.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: outfile,
  external: ['node:*', 'fs', 'path'],
  minify: false
});

const minified = await minify(readFileSync(outfile, 'utf-8'), {
  module: true,
  compress: { passes: 2, unsafe: true, unsafe_math: true, unsafe_methods: true },
  mangle: { toplevel: true }
});

writeFileSync(outfile, minified.code!);

