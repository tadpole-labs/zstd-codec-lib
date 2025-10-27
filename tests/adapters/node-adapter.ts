
/**
 * Reference Implementation Adapter using node:zlib
 */

import { Buffer } from 'node:buffer';
import { 
  zstdCompressSync, 
  zstdDecompressSync, 
  zstdCompress, 
  zstdDecompress,
  constants
} from 'node:zlib';

interface CompressionOptions {
  level?: number;
  dictionary?: Buffer | Uint8Array;
}

interface DecompressionOptions {
  dictionary?: Buffer | Uint8Array;
}

export interface ZstdAdapter {
  compress(data: Buffer | Uint8Array, options?: CompressionOptions): Buffer;
  decompress(data: Buffer | Uint8Array, options?: DecompressionOptions): Buffer;
  compressAsync(data: Buffer | Uint8Array, options?: CompressionOptions): Promise<Buffer>;
  decompressAsync(data: Buffer | Uint8Array, options?: DecompressionOptions): Promise<Buffer>;
}

export const nodeAdapter: ZstdAdapter = {
  compress(data: Buffer | Uint8Array, options: CompressionOptions = {}): Buffer {
    const level = options.level ?? 3;
    const dict = (options.dictionary ?? (options as any).dict) as Buffer | Uint8Array | undefined;
    const opts: any = {
      params: { [constants.ZSTD_c_compressionLevel]: level }
    };
    if (dict) opts.dictionary = dict;
    return Buffer.from(zstdCompressSync(data, opts));
  },
  
  decompress(data: Buffer | Uint8Array, options: DecompressionOptions = {}): Buffer {
    const dict = (options.dictionary ?? (options as any).dict) as Buffer | Uint8Array | undefined;
    const opts = dict ? { dictionary: dict } : {};
    return Buffer.from(zstdDecompressSync(data, opts));
  },
  
  async compressAsync(data: Buffer | Uint8Array, options: CompressionOptions = {}): Promise<Buffer> {
    const level = options.level ?? 3;
    const dict = (options.dictionary ?? (options as any).dict) as Buffer | Uint8Array | undefined;
    const opts: any = {
      params: { [constants.ZSTD_c_compressionLevel]: level }
    };
    if (dict) opts.dictionary = dict;
    
    return new Promise((resolve, reject) => {
      zstdCompress(data, opts, (err, result) => {
        if (err) reject(err);
        else resolve(Buffer.from(result));
      });
    });
  },
  
  async decompressAsync(data: Buffer | Uint8Array, options: DecompressionOptions = {}): Promise<Buffer> {
    const dict = (options.dictionary ?? (options as any).dict) as Buffer | Uint8Array | undefined;
    const opts = dict ? { dictionary: dict } : {};
    
    return new Promise((resolve, reject) => {
      zstdDecompress(data, opts, (err, result) => {
        if (err) reject(err);
        else resolve(Buffer.from(result));
      });
    });
  }
};
