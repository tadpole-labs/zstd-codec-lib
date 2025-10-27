import { readFileSync } from 'fs';
import { join } from 'path';
import * as zlib from 'node:zlib';
import { 
  decompress as wasmDecompress, 
  decompressStream as wasmDecompressStream
} from '../../packages/zstd-wasm-decoder/src/_esm/index.node.js'
import { loadCompressedFiles } from './util.js';

const isBun = typeof Bun !== 'undefined';
const runtime = isBun ? 'Bun' : 'Node.js';

// Helper: Run warmup iterations
const warmup = async (buffers: Buffer[]) => {
  for (let i = 0; i < 3; i++) {
    for (const buf of buffers) {
      zlib.zstdDecompressSync(buf);
      if (isBun) Bun.zstdDecompressSync(buf);
      await wasmDecompress(buf);
      await wasmDecompressStream(buf, true);
    }
  }
};

// Helper: Run benchmark
const runBenchmark = async (
  name: string,
  fn: (buf: Buffer) => Promise<any> | any ,
  buffers: Buffer[],
  fileSizes: number[]
) => {
  let totalMB = 0;
  let totalTime = 0;
  
  for (let i = 0; i < buffers.length; i++) {
    const start = performance.now();
    await fn(buffers[i]);
    totalTime += performance.now() - start;
    totalMB += fileSizes[i] / 1024 / 1024;
  }
  
  const mbps = totalMB / (totalTime / 1000);
  return { name, mbps };
};

// Load precompressed data
const compressedDir = join(import.meta.dirname || __dirname, 'compressed');
const metadata = JSON.parse(readFileSync(join(compressedDir, 'metadata.json'), 'utf-8'));
const benchBuffers = loadCompressedFiles(compressedDir).filter((_, idx, arr) => 
  arr.length > metadata.fileCount ? idx < metadata.fileCount : true
);
const warmupBuffers = loadCompressedFiles(compressedDir).filter((_, idx, arr) => 
  arr.length > metadata.fileCount ? idx >= metadata.fileCount : []
);

await warmup(warmupBuffers);

// Run benchmarks
const results: { name: string; mbps: number; }[] = [];

results.push(await runBenchmark('node:zlib (sync)', buf => zlib.zstdDecompressSync(buf), benchBuffers, metadata.fileSizes));
results.push(await runBenchmark('node:zlib (async)', buf => 
  new Promise((resolve, reject) => zlib.zstdDecompress(buf, (err, result) => err ? reject(err) : resolve(result))),
  benchBuffers, metadata.fileSizes
));

if (isBun) {
  results.push(await runBenchmark('Bun native (sync)', buf => Bun.zstdDecompressSync(buf), benchBuffers, metadata.fileSizes));
  results.push(await runBenchmark('Bun native (async)', buf => Bun.zstdDecompress(buf), benchBuffers, metadata.fileSizes));
}

results.push(await runBenchmark('zstd-wasm (decompress)', buf => wasmDecompress(buf), benchBuffers, metadata.fileSizes));
results.push(await runBenchmark('zstd-wasm (decompressStream)', buf => wasmDecompressStream(buf, true), benchBuffers, metadata.fileSizes));

// Output results
console.log(`${'='.repeat(50)}`);
console.log(`Runtime: ${runtime}`);
console.log(`${'='.repeat(50)}`);
for (const { name, mbps } of results) {
  console.log(`${name.padEnd(30)} ${mbps.toFixed(2).padStart(10)} MB/s`);
}
console.log(`${'='.repeat(50)}`);

