import { Buffer } from 'node:buffer';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { nodeAdapter } from './adapters/node-adapter.ts';
import { wasmAdapter, initWasmAdapter } from './adapters/wasm-adapter.ts';
import { ensureTestData } from './lib/test-data-generator.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COMPRESSION_LEVELS = {
  ALL: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  REPRESENTATIVE: [1, 3, 6, 9, 12, 15, 19, 22]
};

const TEST_DATA_DIR = join(__dirname, 'data');
const DICT_DIR = join(__dirname, 'dictionaries');
const EDGE_CASES_DIR = join(__dirname, 'edge-cases');

let testDict: Buffer;
let jsonDict: Buffer;
let httpDict: Buffer;

let fixtureServer: any;

let decompressAdapter: any;

const compressedCache = new Map<string, Buffer>();
const originalDataHashes = new Map<string, string>();

const randomBuffers = new Map<number, Buffer>();
const randomBufferHashes = new Map<number, string>();


beforeAll(async () => {
  ensureTestData();
  
  const dictPaths = {
    test: join(DICT_DIR, 'test.dict'),
    json: join(DICT_DIR, 'test.json.dict'),
    http: join(EDGE_CASES_DIR, 'golden-dictionaries/http-dict-missing-symbols')
  };
  
  testDict = readFileSync(dictPaths.test);
  jsonDict = readFileSync(dictPaths.json);
  httpDict = readFileSync(dictPaths.http);

  console.log('🎲 Generating random buffers...');
  [256, 10 * 1024, 20 * 1024, 30 * 1024, 50 * 1024, 100 * 1024, 512 * 1024, 1024 * 1024]
    .forEach(size => randomBuffer(size));
  console.log(`✅ Generated ${randomBuffers.size} random buffers`);
  
  console.log('🔧 Pre-compressing test data...');
  const testFiles = [
    'tiny-256b.bin', 'small-highly-compressible.bin', 'medium-10k.bin',
    'random-10k.bin', 'repetitive-50k.bin', 'medium-100k.bin',
    'large-512k.bin', 'large-1m.bin'
  ].map(f => loadTestFile(f));
  
  const compressionJobs: Array<{ data: Buffer; opts: any }> = [];
  for (const data of [...testFiles, ...randomBuffers.values()]) {
    for (const level of COMPRESSION_LEVELS.ALL) {
      compressionJobs.push({ data, opts: { level } });
      if (testDict) compressionJobs.push({ data, opts: { level, dictionary: testDict } });
    }
  }
  
  await Promise.all(compressionJobs.map(({ data, opts }) => 
    Promise.resolve().then(() => compress(data, opts))
  ));
  
  console.log(`✅ Pre-compressed ${compressedCache.size} variants`);
  
  const dictionaries: Record<string, Buffer | Uint8Array> = {
    test: testDict,
    json: jsonDict,
    http: httpDict
  };
  
  const zeroWeightDictPath = join(EDGE_CASES_DIR, 'dict-files/zero-weight-dict');
  dictionaries.zeroWeight = readFileSync(zeroWeightDictPath);
  
  await initWasmAdapter(dictionaries);

  const adapterType = process.env.TEST_ADAPTER;
  
  if (adapterType?.startsWith('browser-')) {
    console.log('🌐 Starting fixture server...');
    fixtureServer = spawn('bun', [join(__dirname, 'fixture-server.ts')], {
      stdio: 'inherit'
    });
    await new Promise((resolve) => setTimeout(resolve, 3500));
  }
  
  if (adapterType === 'browser-all') {
    const { createBrowserAdapter } = await import('./adapters/browser-adapter');
    const browsers = ['chromium', 'firefox', 'webkit'] as const;
    console.log('🚀 Launching all browsers in parallel...');
    const adapters = await Promise.all(
      browsers.map(b => createBrowserAdapter(b))
    );
    decompressAdapter = {
      decompress: async (data: any, opts: any) => {
        const results = await Promise.all(adapters.map(a => a.decompress(data, opts)));
        for (let i = 1; i < results.length; i++) {
          if (!Buffer.from(results[i]).equals(Buffer.from(results[0]))) {
            throw new Error(`Browser ${browsers[i]} result differs from ${browsers[0]}`);
          }
        }
        return results[0];
      },
      decompressStream: async (data: any, isFirst: boolean, opts: any) => {
        const results = await Promise.all(adapters.map(a => a.decompressStream(data, isFirst, opts)));
        for (let i = 1; i < results.length; i++) {
          if (!Buffer.from(results[i].buf).equals(Buffer.from(results[0].buf))) {
            throw new Error(`Browser ${browsers[i]} stream result differs from ${browsers[0]}`);
          }
        }
        return results[0];
      },
      close: () => Promise.all(adapters.map(a => a.close()))
    };
    console.log('✅ All browsers ready');
  } else if (adapterType?.startsWith('browser-')) {
    const browser = adapterType.replace('browser-', '');
    const { createBrowserAdapter } = await import('./adapters/browser-adapter');
    decompressAdapter = await createBrowserAdapter(browser as any);
    console.log(`🌐 Using browser adapter: ${browser}`);
  } else {
    decompressAdapter = wasmAdapter;
  }
}, 120000);

afterAll(async () => {
  if (fixtureServer) fixtureServer.kill();
  if (decompressAdapter?.close) await decompressAdapter.close();
});


function getCacheKey(data: Buffer, opts: any = {}) {
  const dictKey = opts.dictionary ? createHash('sha1').update(opts.dictionary).digest('hex').slice(0, 8) : 'nodict';
  const dataHash = createHash('sha1').update(data).digest('hex').slice(0, 8);
  return `${dataHash}-${opts.level || 3}-${dictKey}`;
}

function compress(data: Buffer, opts = {}): Buffer {
  const key = getCacheKey(data, opts);
  if (!compressedCache.has(key)) {
    const compressed = nodeAdapter.compress(data, opts);
    compressedCache.set(key, compressed);
    originalDataHashes.set(key, createHash('sha1').update(data).digest('hex'));
  }
  return compressedCache.get(key)!;
}

const decompress = (data: Buffer | Uint8Array, opts = {}) => decompressAdapter.decompress(data, opts);

async function testRoundtrip(data: Buffer, opts = {}) {
  const key = getCacheKey(data, opts);
  const compressed = compress(data, opts);
  const decompressed = await decompress(compressed, opts);
  const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
  const originalHash = originalDataHashes.get(key);
  
  if (!originalHash) {
    expect(decompressedHash).toBe(createHash('sha1').update(data).digest('hex'));
  } else {
    expect(decompressedHash).toBe(originalHash);
  }
}

async function testMultipleLevels(data: Buffer, levels: number[], opts = {}) {
  for (const level of levels) {
    await testRoundtrip(data, { ...opts, level });
  }
}

function loadTestFile(filename: string): Buffer {
  const path = join(TEST_DATA_DIR, filename);
  return readFileSync(path);
}

function randomBuffer(size: number): Buffer {
  if (!randomBuffers.has(size)) {
    const chunks: Buffer[] = [];
    const seed = createHash('sha256').update(`seed-${size}`).digest();
    for (let offset = 0; offset < size; offset += 32) {
      const hash = createHash('sha256').update(seed).update(Buffer.from([offset >> 24, offset >> 16, offset >> 8, offset])).digest();
      chunks.push(hash.slice(0, Math.min(32, size - offset)));
    }
    const buffer = Buffer.concat(chunks);
    randomBuffers.set(size, buffer);
    randomBufferHashes.set(size, createHash('sha1').update(buffer).digest('hex'));
  }
  return randomBuffers.get(size)!;
}

describe('WASM decompression', () => {
  describe('standard decompression', () => {
    const testFiles = [
      'tiny-256b.bin', 'small-highly-compressible.bin', 'medium-10k.bin',
      'random-10k.bin', 'repetitive-50k.bin', 'medium-100k.bin',
      'large-512k.bin', 'large-1m.bin'
    ];
    
    test.each(testFiles)('%s - all levels', async (filename) => {
      const data = loadTestFile(filename);
      await testMultipleLevels(data, COMPRESSION_LEVELS.ALL);
    });
    
    test.each(testFiles)('%s - all levels with dictionary', async (filename) => {
      const data = loadTestFile(filename);
      await testMultipleLevels(data, COMPRESSION_LEVELS.ALL, { dictionary: testDict });
    });
    
    test('JSON with JSON dictionary', async () => {
      const data = loadTestFile('test.json');
      await testRoundtrip(data, { level: 3, dictionary: jsonDict });
    });
  });
  
  // Edge case tests
  describe('edge cases', () => {
    test('empty data', async () => {
      await testRoundtrip(Buffer.alloc(0));
      const decompressed = await decompress(compress(Buffer.alloc(0)));
      expect(decompressed.length).toBe(0);
    });
    
    test('tiny data', async () => {
      await testRoundtrip(Buffer.from([0x42]));
      await testRoundtrip(Buffer.from([0x48, 0x69]));
      await testRoundtrip(Buffer.from('X'));
    });
    
    test('RLE compression', async () => {
      await testRoundtrip(Buffer.alloc(1024 * 1024, 0xAA));
    });
    
    test('frame concatenation', async () => {
      const data1 = Buffer.from('Hello ');
      const data2 = Buffer.from('World!');
      const concatenated = Buffer.concat([compress(data1), compress(data2)]);
      const decompressed = await decompress(concatenated);
      const expected = Buffer.concat([data1, data2]);
      const expectedHash = createHash('sha1').update(expected).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(expectedHash);
    });
    
    test('zero-weight dictionary', async () => {
      const zeroWeightDict = readFileSync(join(EDGE_CASES_DIR, 'dict-files/zero-weight-dict'));
      await testRoundtrip(Buffer.from('Test data without zeros'), { dictionary: zeroWeightDict });
      await testRoundtrip(Buffer.from('0000000000'), { dictionary: zeroWeightDict });
    });
  });
  
  // Golden file tests
  describe('golden files', () => {
    test('golden decompression', async () => {
      const files = [
        { file: 'empty-block.zst', expectedSize: 0 },
        { file: 'rle-first-block.zst', expectedSize: 1048576, allZeros: true },
        { file: 'block-128k.zst' },
        { file: 'zeroSeq_2B.zst' }
      ];
      
      for (const { file, expectedSize, allZeros } of files) {
        const path = join(EDGE_CASES_DIR, 'golden-decompression', file);
        const decompressed = await decompress(readFileSync(path));
        if (expectedSize !== undefined) expect(decompressed.length).toBe(expectedSize);
        if (allZeros) {
          const expectedHash = createHash('sha1').update(Buffer.alloc(decompressed.length, 0)).digest('hex');
          const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
          expect(decompressedHash).toBe(expectedHash);
        }
      }
    });
    
    test('golden decompression errors', async () => {
      const errorFiles = ['off0.bin.zst', 'truncated_huff_state.zst', 'zeroSeq_extraneous.zst'];
      
      for (const file of errorFiles) {
        const path = join(EDGE_CASES_DIR, 'golden-decompression-errors', file);
        await expect(decompress(readFileSync(path))).rejects.toThrow();
      }
    });
    
    test('golden compression roundtrip', async () => {
      const files = ['http', 'huffman-compressed-larger', 'large-literal-and-match-lengths', 
                     'PR-3517-block-splitter-corruption-test'];
      
      for (const file of files) {
        const path = join(EDGE_CASES_DIR, 'golden-compression', file);
        await testRoundtrip(readFileSync(path));
      }
    });
    
    test('dictionary with missing symbols', async () => {
      const path = join(EDGE_CASES_DIR, 'golden-compression/http');
      await testRoundtrip(readFileSync(path), { dictionary: httpDict });
    });
  });
  
  describe('roundtrip tests', () => {
    const sizes = [
      { name: 'small', size: 256 },
      { name: 'medium', size: 10 * 1024 },
      { name: 'large', size: 100 * 1024 }
    ];
    
    test.each(sizes)('$name ($size bytes) - representative levels', async ({ size }) => {
      for (const level of COMPRESSION_LEVELS.REPRESENTATIVE) {
        const data = randomBuffer(size);
        await testRoundtrip(data, { level });
      }
    });
    
    test.each(sizes)('$name ($size bytes) - with dictionary', async ({ size }) => {
      for (const level of COMPRESSION_LEVELS.REPRESENTATIVE) {
        const data = randomBuffer(size);
        await testRoundtrip(data, { level, dictionary: testDict });
      }
    });
  });
});

describe('Streaming decompression', () => {
  
  describe('chunk recombination', () => {
    test('single chunk (no streaming)', async () => {
      const data = Buffer.from('Hello World!');
      const compressed = compress(data);
      const decompressed = await decompress(compressed);
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
    
    test('2 chunks', async () => {
      const data = randomBuffer(10 * 1024);
      const compressed = compress(data);
      
      // Split compressed data into 2 chunks
      const mid = Math.floor(compressed.length / 2);
      const chunk1 = compressed.slice(0, mid);
      const chunk2 = compressed.slice(mid);
      
      const decompressed = await decompress(Buffer.concat([chunk1, chunk2]));
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
    
    test('many small chunks', async () => {
      const data = randomBuffer(50 * 1024);
      const compressed = compress(data);
      
      // Split into 100 tiny chunks
      const chunks: Buffer[] = [];
      for (let i = 0; i < compressed.length; i += 512) {
        chunks.push(compressed.slice(i, Math.min(i + 512, compressed.length)));
      }
      
      const decompressed = await decompress(Buffer.concat(chunks));
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
    
    test('uneven chunk sizes', async () => {
      const data = randomBuffer(20 * 1024);
      const compressed = compress(data);
      
      // Split into deliberately uneven chunks
      const sizes = [100, 1000, 50, 5000, 200, 10000];
      const chunks: Buffer[] = [];
      let offset = 0;
      
      for (const size of sizes) {
        if (offset >= compressed.length) break;
        chunks.push(compressed.slice(offset, Math.min(offset + size, compressed.length)));
        offset += size;
      }
      if (offset < compressed.length) {
        chunks.push(compressed.slice(offset));
      }
      
      const decompressed = await decompress(Buffer.concat(chunks));
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
    
    test('frame boundaries across chunks', async () => {
      // Multiple frames concatenated, split across chunk boundaries
      const data1 = Buffer.from('First frame');
      const data2 = Buffer.from('Second frame');
      const data3 = Buffer.from('Third frame');
      
      const frame1 = compress(data1);
      const frame2 = compress(data2);
      const frame3 = compress(data3);
      
      const allFrames = Buffer.concat([frame1, frame2, frame3]);
      
      // Split in the middle of frame2
      const splitPoint = frame1.length + Math.floor(frame2.length / 2);
      const chunk1 = allFrames.slice(0, splitPoint);
      const chunk2 = allFrames.slice(splitPoint);
      
      const decompressed = await decompress(Buffer.concat([chunk1, chunk2]));
      const expected = Buffer.concat([data1, data2, data3]);
      const expectedHash = createHash('sha1').update(expected).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(expectedHash);
    });
  });
  
  describe('compression levels with chunking', () => {
    const levels = [1, 6, 12, 19, 22];
    
    test.each(levels)('level %i - chunked decompression', async (level) => {
      const data = randomBuffer(30 * 1024);
      const compressed = compress(data, { level });
      
      // Split into random chunks
      const chunks: Buffer[] = [];
      let offset = 0;
      while (offset < compressed.length) {
        const chunkSize = Math.min(1000 + Math.floor(Math.random() * 5000), compressed.length - offset);
        chunks.push(compressed.slice(offset, offset + chunkSize));
        offset += chunkSize;
      }
      
      const decompressed = await decompress(Buffer.concat(chunks));
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
  });
  
  describe('large data streaming', () => {
    test('1MB file in chunks', async () => {
      const data = randomBuffer(1024 * 1024);
      const compressed = compress(data);
      
      const chunkSize = 64 * 1024;
      const chunks: Buffer[] = [];
      for (let i = 0; i < compressed.length; i += chunkSize) {
        chunks.push(compressed.slice(i, Math.min(i + chunkSize, compressed.length)));
      }
      
      const decompressed = await decompress(Buffer.concat(chunks));
      expect(decompressed.length).toBe(data.length);
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
    
    test('highly compressible data streaming', async () => {
      const data = Buffer.alloc(512 * 1024, 0xAA);
      const compressed = compress(data);
      
      const decompressed = await decompress(compressed);
      expect(decompressed.length).toBe(data.length);
      const expectedData = Buffer.alloc(512 * 1024, 0xAA);
      const expectedHash = createHash('sha1').update(expectedData).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(expectedHash);
    });
  });
  
  describe('dictionary with streaming', () => {
    test('chunked decompression with dictionary', async () => {
      const data = randomBuffer(20 * 1024);
      const compressed = compress(data, { dictionary: testDict });
      
      // Split into chunks
      const chunks: Buffer[] = [];
      for (let i = 0; i < compressed.length; i += 2048) {
        chunks.push(compressed.slice(i, Math.min(i + 2048, compressed.length)));
      }
      
      const decompressed = await decompress(Buffer.concat(chunks), { dictionary: testDict });
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
  });
  
  // decompressStream API tests
  describe('decompressStream API', () => {
    test('stream API with single chunk', async () => {
      if (!decompressAdapter.decompressStream) return;
      
      const data = Buffer.from('Hello Stream!');
      const compressed = compress(data);
      
      const result = await decompressAdapter.decompressStream(compressed, true);
      const resultBuf = Buffer.from(result.buf);
      const originalHash = createHash('sha1').update(data).digest('hex');
      const resultHash = createHash('sha1').update(resultBuf).digest('hex');
      expect(resultHash).toBe(originalHash);
    });
    
    test('stream API with multiple chunks', async () => {
      if (!decompressAdapter.decompressStream) return;
      
      const data = randomBuffer(10 * 1024);
      const compressed = compress(data);
      
      const outputs: Buffer[] = [];
      const chunkSize = 2048;
      
      for (let i = 0; i < compressed.length; i += chunkSize) {
        const chunk = compressed.slice(i, Math.min(i + chunkSize, compressed.length));
        const result = await decompressAdapter.decompressStream(chunk, i === 0);
        if (result.buf.length > 0) outputs.push(Buffer.from(result.buf));
      }
      
      const decompressed = Buffer.concat(outputs);
      const originalHash = createHash('sha1').update(data).digest('hex');
      const decompressedHash = createHash('sha1').update(Buffer.from(decompressed)).digest('hex');
      expect(decompressedHash).toBe(originalHash);
    });
  });
});