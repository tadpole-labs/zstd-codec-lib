import type { StreamResult, DecoderOptions } from './types.js';

/**
 * DecompressionStream that supports both native formats and "zstd"
 * Usage: 
 *   - new DecompressionStream("gzip")  -> native browser API
 *   - new DecompressionStream("zstd")  -> polyfilled WASM module
 */
export declare class DecompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  
  /**
   * @param format - Compression format ("gzip", "deflate", "deflate-raw", or "zstd")
   * @param options - Optional dictionary
   */
  constructor(format: string, options?: { 
    dictionary?: Uint8Array;
    wasmPath?: string;
  });
}

/**
 * Decompress data completely
 * @param input - Compressed data
 * @param options - Optional configuration including dictionary
 */
export declare function decompress(
  input: Uint8Array,
  options?: { 
    dictionary?: Uint8Array;
    wasmPath?: string;
  }
): Promise<Uint8Array>;

/**
 * Decompress a stream of data
 * @param input - Compressed data frame(s)
 * @param reset - Whether to reset the decoder state
 * @param options - Optional configuration including dictionary
 */
export declare function decompressStream(
  input: Uint8Array,
  reset?: boolean,
  options?: { 
    dictionary?: Uint8Array;
    wasmPath?: string;
  }
): Promise<StreamResult>;

/**
 * Decompress data synchronously (when expected size is known)
 * @param input - Compressed data frame(s)
 * @param expectedSize - Expected size of decompressed data
 * @param options - Optional configuration including dictionary
 */
export declare function decompressSync(
  input: Uint8Array,
  expectedSize?: number,
  options?: { 
    dictionary?: Uint8Array;
    wasmPath?: string;
  }
): Promise<Uint8Array>;

/**
 * Create a decoder instance
 * @param options - Decoder configuration
 */
export declare function createDecoder(
  options?: {
    wasmPath?: string;
    dictionary?: Uint8Array;
  }
): Promise<ZstdDecoder>;

/**
 * Lower-level Zstd decoder class
 */
export declare class ZstdDecoder {
  constructor(options?: DecoderOptions);
  init(wasmModule?: WebAssembly.Module): Promise<ZstdDecoder>;
  decompressStream(data: Uint8Array, reset?: boolean): StreamResult;
  decompressSync(data: Uint8Array, expectedSize?: number): Uint8Array;
}

export type { DecoderOptions, StreamResult };

declare const _default: {
  createDecoder: typeof createDecoder;
  decompress: typeof decompress;
  decompressSync: typeof decompressSync;
  decompressStream: typeof decompressStream;
  DecompressionStream: typeof DecompressionStream;
};

export default _default;
