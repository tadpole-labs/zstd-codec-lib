
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
    const { level = 3, dictionary } = options;
    const opts: any = {
      params: { [constants.ZSTD_c_compressionLevel]: level }
    };
    if (dictionary) opts.dictionary = dictionary;
    return Buffer.from(zstdCompressSync(data, opts));
  },
  
  decompress(data: Buffer | Uint8Array, options: DecompressionOptions = {}): Buffer {
    const { dictionary } = options;
    const opts = dictionary ? { dictionary } : {};
    return Buffer.from(zstdDecompressSync(data, opts));
  },
  
  async compressAsync(data: Buffer | Uint8Array, options: CompressionOptions = {}): Promise<Buffer> {
    const { level = 3, dictionary } = options;
    const opts: any = {
      params: { [constants.ZSTD_c_compressionLevel]: level }
    };
    if (dictionary) opts.dictionary = dictionary;
    
    return new Promise((resolve, reject) => {
      zstdCompress(data, opts, (err, result) => {
        if (err) reject(err);
        else resolve(Buffer.from(result));
      });
    });
  },
  
  async decompressAsync(data: Buffer | Uint8Array, options: DecompressionOptions = {}): Promise<Buffer> {
    const { dictionary } = options;
    const opts = dictionary ? { dictionary } : {};
    
    return new Promise((resolve, reject) => {
      zstdDecompress(data, opts, (err, result) => {
        if (err) reject(err);
        else resolve(Buffer.from(result));
      });
    });
  }
};

