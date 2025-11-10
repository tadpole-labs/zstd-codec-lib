export type { BaseWasmExports, DecoderWasmExports } from './types.js';

/**
 * A {@link ReadableStream}/{@link WritableStream} Web Streams API transformer for Zstandard decompression.
 * 
 * This streaming decompression class allows processing ZSTD-compressed data supplied in chunks,
 * e.g. from a network source, as it arrives. This is useful for situations where you don't have the entire compressed buffer in advance, e.g. long-running network requests.
 *
 * Each chunk written to the writable end is decompressed
 * and delivered as a Uint8Array from the readable end.
 * 
 * The transform automatically buffers input until
 * enough data is available to read the ZSTD frame header,
 * at which point it allocates decoding resources and begins decompressing.
 * 
 * The stream will acquire and manage decoders transparently.
 * When the stream is closed, it will release or destroy decoding resources as appropriate.
 *
 * @example
 * ```ts
 * const ds = new ZstdDecompressionStream();
 * const response = await fetch('/file.zst');
 * const decompressedStream = response.body.pipeThrough(ds);
 * ```
 *
 * @see {@link ReadableStream}
 * @see {@link WritableStream}
 * @see {@link decompressStream}
 */
export declare class ZstdDecompressionStream {
  /**
   * The resulting decompressed stream to read output from.
   * @type {ReadableStream<Uint8Array>}
   */
  readonly readable: ReadableStream;
  /**
   * The writable end of the stream to pipe compressed chunks into.
   * @type {WritableStream<BufferSource>}
   */
  readonly writable: WritableStream;

  /**
   * @param {ZstdOptions} [options] - Optional decoder configuration.
   */
  constructor(options?: ZstdOptions);
}

/**
 * Decompress a Zstandard-compressed buffer into a Uint8Array.
 * 
 * This is a convenient, Promise-based wrapper for decompressing
 * an entire compressed buffer at once. A convenience for drop-in
 * replacements.
 *
 * Internally, this calls {@link decompressStream} and returns only `.buf`.
 *
 * @param {Uint8Array} input - The compressed Zstandard data.
 * @param {ZstdOptions} [options] - Optional decompression options.
 * @returns {Promise<Uint8Array>} Resolves with the decompressed buffer.
 *
 * @example
 * const decompressed = await decompress(compressedData);
 *
 * @see decompressStream
 */
export declare function decompress(
  input: Uint8Array,
  options?: ZstdOptions
): Promise<Uint8Array>;

/**
 * Decompresses a Zstandard-compressed stream into a {@link StreamResult}.
 *
 * Use this function when the entire input is already fully available in memory,
 * or if you want to decompress large data while still giving the main thread
 * some breathing room.
 *
 * This function is suitable for decompressing data that exceeds
 * what can fit in static in/out buffers.
 * 
 * Note: This is not an incremental streaming API
 * see {@link ZstdDecompressionStream} for streaming input.
 *
 * @param {Uint8Array} input - The compressed Zstandard data.
 * @param {boolean} [reset=false] - Whether to reset the decoder context (default: false).
 * @param {ZstdOptions} [options] - Optional decompression options.
 * @returns {Promise<StreamResult>} Resolves with the decompressed output and input offset.
 *
 * @example
 * const result = await decompressStream(compressedData);
 * // result.buf contains output, result.in_offset is input offset consumed
 *
 * @see ZstdDecompressionStream
 */
export declare function decompressStream(
  input: Uint8Array,
  reset?: boolean,
  options?: ZstdOptions
): Promise<StreamResult>;

/**
 * Decompress a Zstandard-compressed buffer synchronously.
 *
 * This function is for use when the expected decompressed size is known
 * and fits within reasonable memory constraints.
 *
 * @param {Uint8Array} input - The compressed Zstandard data.
 * @param {number} [expectedSize] - The exact size of the decompressed output, in bytes.
 * @param {ZstdOptions} [options] - Optional decompression options.
 * @returns {Uint8Array} The decompressed output buffer.
 *
 * @example
 * const decompressed = decompressSync(compressedData, 123456);
 */
export declare function decompressSync(
  input: Uint8Array,
  expectedSize?: number,
  options?: ZstdOptions
): Uint8Array;

/**
 * Creates a decoder instance with auto-loaded WASM module.
 *
 * @param options - Configuration options (dictionary and WASM path)
 * @returns Initialized decoder instance
 */
export declare function createDecoder(options?: ZstdOptions): Promise<ZstdDecoder>;

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
  _destroy(): void;
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
