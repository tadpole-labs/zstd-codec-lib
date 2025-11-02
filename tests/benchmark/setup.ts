import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { collectChainData } from './util.js';
import * as zlib from 'node:zlib';

const dir = join(import.meta.dirname || process.cwd(), 'compressed');
const TARGET = 1000;

if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const existing = readdirSync(dir).filter(f => f.match(/^data-\d+\.zst$/)).length;

if (existing < TARGET) {
  const data = await collectChainData(TARGET, existing);
  console.log(`\nCompressing ${data.length} files...`);
  data.forEach((buf, i) => {
    writeFileSync(join(dir, `data-${existing + i}.zst`), buf);
    if ((i + 1) % 100 === 0) process.stdout.write(`\r${i + 1}/${data.length}`);
  });
  console.log(`\nDone`);
}

console.log('Generating metadata...');
const files = readdirSync(dir)
  .filter(f => f.match(/^data-\d+\.zst$/))
  .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0'));

const sizes = files.map(f => zlib.zstdDecompressSync(readFileSync(join(dir, f))).length);

writeFileSync(join(dir, 'metadata.json'), JSON.stringify({
  fileSizes: sizes,
  fileCount: files.length,
  totalOriginalSize: sizes.reduce((a, b) => a + b, 0)
}));

