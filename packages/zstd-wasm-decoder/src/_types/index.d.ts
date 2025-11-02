export * from './types.js';

/**
 * ZstdDecompressionStream
 * 
 * https://streams.spec.whatwg.org/
 */
export declare class ZstdDecompressionStream {
  readonly readable: ReadableStream;
  readonly writable: WritableStream;
  
  /**
   * @param options - Optional dictionary and configuration
   */
  constructor(options?: ZstdOptions);
}

/**
 * Decompress data completely
 * @param input - Compressed data
 * @param options - Optional configuration including dictionary
 */
export declare function decompress(
  input: Uint8Array,
  options?: ZstdOptions
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
  options?: ZstdOptions
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
  options?: ZstdOptions
): Promise<Uint8Array>;

/**
 * Create a decoder instance
 * @param options - Decoder configuration
 */
export declare function createDecoder(
  options?: ZstdOptions
): Promise<ZstdDecoder>;

/**
 * Lower-level Zstd decoder class
 */
export declare class ZstdDecoder {
  constructor(options?: DecoderOptions);
  init(wasmModule?: WebAssembly.Module): Promise<ZstdDecoder>;
  decompressStream(data: Uint8Array, reset?: boolean): StreamResult;
  decompressSync(data: Uint8Array, expectedSize?: number): Uint8Array;
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
