#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { minify } from 'terser';
import { deflateRawSync } from 'node:zlib';
import { execSync } from 'node:child_process';

const DIST_DIR = join(import.meta.dir, 'dist');
const SRC_DIR = join(import.meta.dir, 'src');
const WASM_PATH = join(SRC_DIR, 'build/zstd.wasm');

if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });

console.log('📦 Building zstd-wasm-decoder bundles...\n');

const terserOptions = {
  mangle: {
    toplevel: true,
    reserved: ['_ZSTD_createDCtx', '_ZSTD_freeDCtx', '_ZSTD_createDDict', 
               '_ZSTD_freeDDict', '_ZSTD_decompress_usingDDict', 
               '_ZSTD_decompressStream', '_ZSTD_DCtx_reset', 
               '_ZSTD_DCtx_refDDict', '_ZSTD_isError'],
    properties: {
      regex: /^_(?!ZSTD_)/,
      reserved: []
    }
  },
  compress: {
    passes: 2,
    unsafe: true,
    unsafe_math: true
  }
};

const configs = [
  {
    name: 'Web ESM',
    entry: join(SRC_DIR, 'index.web.ts'),
    outfile: 'index.web.js',
    format: 'esm',
    target: 'browser',
    minify: false
  },
  {
    name: 'Web ESM (minified)',
    entry: join(SRC_DIR, 'index.web.ts'),
    outfile: 'index.web.min.js',
    format: 'esm',
    target: 'browser',
    minify: true
  },
  {
    name: 'Node.js ESM',
    entry: join(SRC_DIR, 'index.node.ts'),
    outfile: 'index.node.js',
    format: 'esm',
    target: 'node',
    minify: false
  },
  {
    name: 'Core Library',
    entry: join(SRC_DIR, 'zstd-wasm.ts'),
    outfile: 'zstd-wasm.js',
    format: 'esm',
    target: 'browser',
    minify: false
  },
  {
    name: 'Core Library (minified)',
    entry: join(SRC_DIR, 'zstd-wasm.ts'),
    outfile: 'zstd-wasm.min.js',
    format: 'esm',
    target: 'browser',
    minify: true
  }
];

for (const config of configs) {
  const result = await Bun.build({
    entrypoints: [config.entry],
    outdir: DIST_DIR,
    target: config.target as 'browser' | 'node',
    format: config.format as any,
    minify: false,
    naming: config.outfile
  });
  
  if (!result.success) {
    console.error(`❌ Failed to build ${config.name}`);
    for (const log of result.logs) console.error(log);
    continue;
  }
  
  if (config.minify) {
    const filePath = join(DIST_DIR, config.outfile);
    const minified = await minify(readFileSync(filePath, 'utf8'), terserOptions);
    if (minified.code) writeFileSync(filePath, minified.code);
  } else {
    console.log(`✅ Built: ${config.outfile}`);
  }
}

// Pre-compress with deflate-raw level 7 before encoding to base64
const wasmBase64 = deflateRawSync(readFileSync(WASM_PATH), { level: 7 }).toString('base64');

const inlinedResult = await Bun.build({
  entrypoints: [join(SRC_DIR, 'index.web.inlined.ts')],
  outdir: DIST_DIR,
  target: 'browser',
  format: 'esm',
  minify: false,
  naming: 'index.inlined.js'
});

if (inlinedResult.success) {
  const filePath = join(DIST_DIR, 'index.inlined.js');
  let code = readFileSync(filePath, 'utf8');
  code = code.replace('__WASM_BASE64_PLACEHOLDER__', wasmBase64);
  writeFileSync(filePath, code);

  const minified = await minify(code, terserOptions);
  if (minified.code) writeFileSync(join(DIST_DIR, 'index.inlined.min.js'), minified.code);
}

writeFileSync(join(DIST_DIR, 'zstd-decoder.wasm'), readFileSync(WASM_PATH));

try {
  execSync('npx tsc --project tsconfig.json', {
    cwd: join(import.meta.dir),
    stdio: 'inherit'
  });
} catch (error) {
  console.warn('⚠️ Could not generate TypeScript declarations.');
  try {
    copyFileSync(join(SRC_DIR, 'types.d.ts'), join(DIST_DIR, 'types.d.ts'));
  } catch (e) {
    console.error('❌ Failed to copy types.d.ts:', e);
  }
}

console.log('\n🎉 Build complete! Files in dist/');
