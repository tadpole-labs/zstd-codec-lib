export * from './types.js';

/**
 * WHATWG Streams API compatible transform stream for decompressing ZSTD data.
 * 
 * @see https://streams.spec.whatwg.org/
 */
export declare class ZstdDecompressionStream {
  readonly readable: ReadableStream;
  readonly writable: WritableStream;
  
  /**
   * Creates a new ZSTD decompression transform stream.
   * 
   * @param options - Configuration options (dictionary and WASM path)
   */
  constructor(options?: ZstdOptions);
}

/**
 * Decompresses ZSTD compressed data.
 * 
 * @param input - ZSTD compressed data
 * @param options - Configuration options (dictionary and WASM path)
 * @returns Decompressed data
 */
export declare function decompress(
  input: Uint8Array,
  options?: ZstdOptions
): Promise<Uint8Array>;

/**
 * Decompresses ZSTD data using the streaming API for chunked processing.
 * 
 * @param input - ZSTD compressed data chunk
 * @param reset - Whether to reset the decompression context
 * @param options - Configuration options (dictionary and WASM path)
 * @returns Stream result with decompressed buffer and offset metadata
 */
export declare function decompressStream(
  input: Uint8Array,
  reset?: boolean,
  options?: ZstdOptions
): Promise<StreamResult>;

/**
 * Decompresses ZSTD data when the expected size is known.
 * 
 * @param input - ZSTD compressed data
 * @param expectedSize - Expected size of the decompressed data
 * @param options - Configuration options (dictionary and WASM path)
 * @returns Decompressed data
 */
export declare function decompressSync(
  input: Uint8Array,
  expectedSize?: number,
  options?: ZstdOptions
): Promise<Uint8Array>;

/**
 * Creates a decoder instance with auto-loaded WASM module.
 * 
 * @param options - Configuration options (dictionary and WASM path)
 * @returns Initialized decoder instance
 */
export declare function createDecoder(
  options?: ZstdOptions
): Promise<ZstdDecoder>;

/**
 * Low-level ZSTD decoder class
 */
export declare class ZstdDecoder {
  /**
   * Creates a new ZSTD decoder instance.
   * 
   * @param options - Decoder configuration options
   */
  constructor(options?: DecoderOptions);
  
  /**
   * Initializes the decoder with a WebAssembly module.
   * 
   * @param wasmModule - Compiled WebAssembly module
   * @returns Promise that resolves to the initialized decoder
   */
  init(wasmModule?: WebAssembly.Module): Promise<ZstdDecoder>;
  
  /**
   * Decompresses data using the streaming API.
   * 
   * @param data - ZSTD compressed data chunk
   * @param reset - Whether to reset the decompression context
   * @returns Stream result with decompressed buffer and offset metadata
   */
  decompressStream(data: Uint8Array, reset?: boolean): StreamResult;
  
  /**
   * Decompresses data synchronously.
   * 
   * @param data - ZSTD compressed data
   * @param expectedSize - Expected size of the decompressed data
   * @returns Decompressed data
   */
  decompressSync(data: Uint8Array, expectedSize?: number): Uint8Array;
  
  /**
   * Cleans up decoder resources.
   */
  destroy(): void;
}

export type { DecoderOptions, StreamResult, ZstdOptions };

declare const _default: {
  createDecoder: typeof createDecoder;
  decompress: typeof decompress;
  decompressSync: typeof decompressSync;
  decompressStream: typeof decompressStream;
  ZstdDecompressionStream: typeof ZstdDecompressionStream;
};

export default _default;
