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
const WASM_PERF_PATH = join(BUILD_DIR, 'zstd-perf.wasm');
const ROOT_DIR = join(PKG_DIR, '..', '..');
const LICENSE_PATH = join(ROOT_DIR, 'LICENSE');
const README_PATH = join(ROOT_DIR, 'README.md');

const PREP = process.argv.includes('--prep');

[ESM_DIR, TYPES_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

if (!existsSync(WASM_SOURCE_PATH)) {
  console.error('WASM file not found at:', WASM_SOURCE_PATH);
  process.exit(1);
}

if (!existsSync(WASM_PERF_PATH)) {
  console.error('Perf WASM file not found at:', WASM_PERF_PATH);
  process.exit(1);
}

console.log(`WASM size-optimized: ${(Bun.file(WASM_SOURCE_PATH).size).toLocaleString()} bytes`);
console.log(`WASM perf-optimized: ${(Bun.file(WASM_PERF_PATH).size).toLocaleString()} bytes\n`);

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
    reserved: ['_initialize'],
    properties: {
      regex: /^_(?!initialize)/,
      reserved: ['_initialize']
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
    comments: /(@__PURE__|@__NO_SIDE_EFFECTS__|#__PURE__|#__NO_SIDE_EFFECTS__)/,
    shebang: false,
    webkit: true,
    beautify: false,
  }
};

const configs: Array<{
  name: string;
  entry: string;
  outfile: string;
  format: string;
  target: string;
  minify: boolean;
  external?: string[];
}> = [
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
    name: 'Cloudflare Workers ESM (minified)',
    entry: join(SRC_DIR, 'index.cloudflare.ts'),
    outfile: 'index.cloudflare.js',
    format: 'esm',
    target: 'node',
    minify: true,
    external: ['*.wasm']
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
    conditions: config.target === 'browser' ? ['browser', 'import'] : ['node', 'import'],
    naming: config.outfile,
    sourcemap: 'linked',
    packages: 'external',
    external: config.external || [],
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
 * Pre-compress with deflate-raw using zopfli for maximum compression before encoding to base64.
 * 
 * Yields a smaller bundle size when compressed twice 
 * 
 * Opaque + decomp. via DecompressionStreams API
 * 
 * .wasm  =>  zopfli deflate-raw  =>  base64  =>  .js  => gzip/brotli/zstd
 * 
 * Comparatively the cost of an additional network request
 * to shave off the extra bytes by splitting the .wasm and .js module
 * 
 * isn't worth it (for slim modules)
 */

function compressWithZopfli(inputPath: string): Buffer {
  const tmpOutput = `${inputPath}.zopfli.tmp`;
  console.log(`Compressing with zopfli (exhaustive): ${inputPath}`);
  
  try {
    // Below 2k iter zopfli iter we are not sufficiently using all of zopflis power
    // Above 2k iter it compresses too hard that the wrapping compression is degraded
    execSync(`zopfli --deflate --i20 "${inputPath}" -c > "${tmpOutput}"`, {
      stdio: ['inherit', 'inherit', 'inherit']
    });
    
    const compressed = readFileSync(tmpOutput);
    execSync(`rm "${tmpOutput}"`);
    
    console.log(`  Original: ${readFileSync(inputPath).length.toLocaleString()} bytes`);
    console.log(`  Compressed: ${compressed.length.toLocaleString()} bytes`);
    console.log(`  Ratio: ${((compressed.length / readFileSync(inputPath).length) * 100).toFixed(2)}%\n`);
    
    return compressed;
  } catch (error) {
    console.warn('Zopfli compression failed, falling back to standard deflate');
    return deflateRawSync(readFileSync(inputPath), { level: 9 });
  }
}

const wasmBase64 = compressWithZopfli(WASM_SOURCE_PATH).toString('base64');
const wasmPerfBase64 = compressWithZopfli(WASM_PERF_PATH).toString('base64');

async function buildInlined(variant: 'size' | 'perf') {
  const base64 = variant === 'perf' ? wasmPerfBase64 : wasmBase64;
  const suffix = variant === 'perf' ? '.perf' : '';
  
  const result = await Bun.build({
    entrypoints: [join(SRC_DIR, 'index.web.inlined.ts')],
    outdir: ESM_DIR,
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: `index.inlined${suffix}.js`,
    sourcemap: 'linked',
    external: [],
    emitDCEAnnotations: true,
    drop: ['console', 'debugger']
  });

  if (result.success) {
    const filePath = join(ESM_DIR, `index.inlined${suffix}.js`);
    let code = readFileSync(filePath, 'utf8');
    code = code.replace('__WASM_BASE64_PLACEHOLDER__', base64);
    writeFileSync(filePath, code);

    const minified = await minify(code, terserOptions);
    if (minified.code) {
      writeFileSync(join(ESM_DIR, `index.inlined${suffix}.min.js`), minified.code);
      const gzipBytes = gzipSync(minified.code, { level: 9, memLevel: 9, windowBits: 15 }).length;
      console.log(`Built (minified): index.inlined${suffix}.min.js - ${gzipBytes.toLocaleString()} bytes (${(gzipBytes / 1024).toFixed(2)} KB) gzipped`);
    }
  }
}

await buildInlined('size');
await buildInlined('perf');

const webJs = readFileSync(join(ESM_DIR, 'index.web.js'), 'utf8');
const webPerfJs = webJs.replace(/zstd-decoder\.wasm/g, 'zstd-decoder-perf.wasm');
writeFileSync(join(ESM_DIR, 'index.web.perf.js'), webPerfJs);
console.log('Built: index.web.perf.js (via string replacement)');

copyFileSync(WASM_SOURCE_PATH, join(ESM_DIR, 'zstd-decoder.wasm'));
copyFileSync(WASM_PERF_PATH, join(ESM_DIR, 'zstd-decoder-perf.wasm'));
try {
  execSync('npx tsc --project tsconfig.json', {
    cwd: PKG_DIR,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  const standaloneDtsFiles = ['types.d.ts', 'index.d.ts'];
  
  for (const file of standaloneDtsFiles) {
    const srcPath = join(SRC_DIR, file);
    
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(TYPES_DIR, file));
      console.log(`Copied: ${file}`);
    }
  }
  } catch (error) {
  console.error(error);
  process.exit(1);
}

if (PREP) {
  console.log('\nCopying root files to src folder...');
  
  if (existsSync(LICENSE_PATH)) {
    copyFileSync(LICENSE_PATH, join(SRC_DIR, 'LICENSE'));
    console.log('Copied: LICENSE');
  } else {
    console.warn('LICENSE file not found at root directory');
  }
  
  if (existsSync(README_PATH)) {
    copyFileSync(README_PATH, join(SRC_DIR, 'README.md'));
    console.log('Copied: README.md');
  } else {
    console.warn('README.md file not found at root directory');
  }
}

