#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { minify } from 'terser';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';

const PKG_DIR = import.meta.dir;
const SRC_DIR = join(PKG_DIR, 'src');
const ESM_DIR = join(SRC_DIR, '_esm');
const TYPES_DIR = join(SRC_DIR, '_types');
const BUILD_DIR = join(PKG_DIR, 'build');
const WASM_SOURCE_PATH = join(BUILD_DIR, 'zstd.wasm');

[ESM_DIR, TYPES_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

if (!existsSync(WASM_SOURCE_PATH)) {
  console.error('WASM file not found at:', WASM_SOURCE_PATH);
  console.error('Run `make` first to build the WASM module');
  process.exit(1);
}

const wasmStats = Bun.file(WASM_SOURCE_PATH);
console.log(`WASM bytecode size: ${(await wasmStats.size).toLocaleString()} bytes\n`);

const terserOptions = {
  ecma: 2020 as const,
  safari10: false,
  ie8: false,
  sourceMap: false,

  // Mb too aggressive
  keep_classnames: false,
  keep_fnames: false,

  parse: {
    html5_comments: false
  },
  mangle: {
    toplevel: true,
    safari10: false,
    reserved: ['_decompressSync', 'isError', 'malloc'],
    properties: {
      regex: /^_(?!decompressSync)/,
      reserved: []
    }
  },
  compress: {
    booleans: true,
    drop_console: true,
    drop_debugger: true,
    dead_code: true,
    pure_funcs: ['console.log', 'console.info', 'console.debug'],
    ecma: 2020 as const,
    passes: 2,
    unsafe: true,
    unsafe_arrows: true,
    unsafe_comps: true,
    unsafe_Function: true,
    unsafe_methods: true,
    unsafe_proto: true,
    unsafe_regexp: true,
    unsafe_undefined: true,
    unsafe_math: true,
    pure_getters: true,
    keep_fargs: false,
    keep_infinity: false,
    hoist_funs: true,
    hoist_vars: true,
    toplevel: true,
    module: true,
    global_defs: {
      DEBUG: false,
    },
  },
  format: {
    ascii_only: true,
    comments: false,
    shebang: false,
    webkit: true,
    beautify: false,
  }
};

const configs = [
  {
    name: 'Web ESM',
    entry: join(SRC_DIR, 'index.web.ts'),
    outfile: 'index.web.js',
    format: 'esm',
    target: 'browser',
    minify: true
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
    minify: true
  },
  {
    name: 'Core Library',
    entry: join(SRC_DIR, 'zstd-wasm.ts'),
    outfile: 'zstd-wasm.js',
    format: 'esm',
    target: 'browser',
    minify: true
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
    outdir: ESM_DIR,
    target: config.target as 'browser' | 'node',
    format: config.format as any,
    minify: true,
    naming: config.outfile,
    sourcemap: 'none',
    packages: 'external',
    external: [],
    emitDCEAnnotations: true,
    drop: config.minify ? ['console', 'debugger'] : [],
  });
  
  if (!result.success) {
    console.error(`Failed to build ${config.name}`);
    for (const log of result.logs) console.error(log);
    continue;
  }
  
  if (config.minify) {
    const filePath = join(ESM_DIR, config.outfile);
    const minified = await minify(readFileSync(filePath, 'utf8'), terserOptions);
    if (minified.code) writeFileSync(filePath, minified.code);
    console.log(`Built (minified): ${config.outfile}`);
  } else {
    console.log(`Built: ${config.outfile}`);
  }
}
/**
 * Pre-compress with deflate-raw (level 7) before encoding to base64.
 * 
 * Yields a smaller bundle size when compressed twice 
 * 
 * Opaque + decomp. via DecompressionStreams API
 * 
 * .wasm  =>  deflate-raw  =>  base64  =>  .js  => gzip/brotli/zstd
 * 
 * Comparatively the cost of an additional network request
 * to shave off the extra bytes by splitting the .wasm and .js module
 * 
 * isn't worth it (for slim modules)
 */
const wasmBase64 = deflateRawSync(readFileSync(WASM_SOURCE_PATH), { level: 7 }).toString('base64');

const inlinedResult = await Bun.build({
  entrypoints: [join(SRC_DIR, 'index.web.inlined.ts')],
  outdir: ESM_DIR,
  target: 'browser',
  format: 'esm',
  minify: true,
  naming: 'index.inlined.js',
  sourcemap: 'none',
  packages: 'external',
  external: [],
  emitDCEAnnotations: true,
  drop: ['console', 'debugger']
});

if (inlinedResult.success) {
  const filePath = join(ESM_DIR, 'index.inlined.js');
  let code = readFileSync(filePath, 'utf8');
  code = code.replace('__WASM_BASE64_PLACEHOLDER__', wasmBase64);
  writeFileSync(filePath, code);

  const minified = await minify(code, terserOptions);
  if (minified.code) {
    writeFileSync(join(ESM_DIR, 'index.inlined.min.js'), minified.code);
    const gzipBytes = gzipSync(minified.code, { level: 7 }).length;
    console.log(`Built (minified): index.inlined.min.js - ${gzipBytes.toLocaleString()} bytes (${(gzipBytes / 1024).toFixed(2)} KB) gzipped`);
  }
}

copyFileSync(WASM_SOURCE_PATH, join(SRC_DIR, 'zstd-decoder.wasm'));

copyFileSync(WASM_SOURCE_PATH, join(ESM_DIR, 'zstd-decoder.wasm'));
try {
  execSync('npx tsc --project tsconfig.json', {
    cwd: PKG_DIR,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  const standaloneDtsFiles = ['types.d.ts', 'index.d.ts'];
  
  for (const file of standaloneDtsFiles) {
    const srcPath = join(SRC_DIR, file);
    const destPath = join(TYPES_DIR, file);
    
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      console.log(`Copied: ${file}`);
    }
  }
  } catch (error) {
  console.error(error);
  process.exit(1);
}

