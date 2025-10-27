import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as zlib from 'node:zlib';

export const compressFiles = (dir: string, randomLevels = false) => {
  return Promise.all(
    readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(file => new Promise<{ original: Buffer, compressed: Buffer, level: number }>(resolve => {
        const level = randomLevels ? 19 : 19;
        const original = readFileSync(join(dir, file));
        const compressed = zlib.zstdCompressSync(original, { 
          params: { [zlib.constants.ZSTD_c_compressionLevel]: level }
        });
        resolve({ original, compressed, level });
      }))
  );
};

export const loadCompressedFiles = (dir: string) => {
  return readdirSync(dir)
    .filter(f => f.endsWith('.zst'))
    .map(file => readFileSync(join(dir, file)));
};

