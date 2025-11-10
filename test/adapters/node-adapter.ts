/**
 * Reference Implementation Adapter using node:zlib
 */

import { Buffer } from 'node:buffer';
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib';

type DecompressionOptions = {
  dictionary?: Buffer | Uint8Array;
};

type CompressionOptions = DecompressionOptions & {
  level?: number;
};

export interface ZstdAdapter {
  compress(data: Buffer | Uint8Array, options?: CompressionOptions): Buffer;
  decompress(data: Buffer | Uint8Array, options?: DecompressionOptions): Buffer;
}

export const nodeAdapter: ZstdAdapter = {
  compress(data: Buffer | Uint8Array, options: CompressionOptions = {}): Buffer {
    const level = options.level ?? 3;
    const dict = (options.dictionary ?? (options as any).dict) as Buffer | Uint8Array | undefined;
    const opts: any = {
      params: { [constants.ZSTD_c_compressionLevel]: level },
    };
    if (dict) opts.dictionary = dict;
    return Buffer.from(zstdCompressSync(data, opts));
  },

  decompress(data: Buffer | Uint8Array, options: DecompressionOptions = {}): Buffer {
    const dict = (options.dictionary ?? (options as any).dict) as Buffer | Uint8Array | undefined;
    const opts = dict ? { dictionary: dict } : {};
    return Buffer.from(zstdDecompressSync(data, opts));
  },
};
