/**
 * Base WebAssembly exports.
 */
export interface BaseWasmExports {
  /** WebAssembly linear memory */
  memory: WebAssembly.Memory;
  
  /** Allocate memory in the WASM module */
  bmalloc(size: number): number;
  
  /** Prune the buffer to a new size */
  prune_buf(new_size: number): void;
}

/**
 * Decoder specific exported functions.
 */
export interface DecoderWasmExports extends BaseWasmExports {
  /** Creates a ZSTD decompression context */
  createDCtx(): void;
  
  /** Creates a ZSTD dictionary for decompression */
  createDict(dictPtr: number, dictSize: number): number;
  
  /** Decompresses data synchronously */
  decompressSync(
    dstPtr: number,
    dstCapacity: number,
    srcPtr: number,
    srcSize: number,
    ddict: number
  ): number;
  
  /** Decompresses a stream of data */
  decStream(
    outputPtr: number,
    inputPtr: number
  ): number;
  
  /** Resets the decompression context */
  reset(): number;
  
  /** References a dictionary in the decompression context */
  refDict(ddict: number): number;
}

/**
 * Configuration options for the ZSTD decoder.
 */
export interface DecoderOptions {
  /** Dictionary to use for decompression */
  dictionary?: Uint8Array;
  
  /** Maximum source (compressed) buffer size in bytes */
  maxSrcSize?: number;
  
  /** Maximum destination (decompressed) buffer size in bytes */
  maxDstSize?: number;
}

/**
 * Options for decoder functions and streams.
 */
export interface ZstdOptions {
  /** Dictionary to use for decompression */
  dictionary?: Uint8Array | ArrayBuffer | Request | string;
  
  /** Path to the WASM module */
  wasmPath?: string;
}

/**
 * Result from a streaming decompression operation.
 */
export interface StreamResult {
  /** Decompressed output buffer */
  buf: Uint8Array;
  
  /** Offset into the input buffer indicating how much was consumed */
  in_offset: number;
}

/**
 * Decoder class for decompressing ZSTD-compressed data.
 */
export declare class ZstdDecoder {
  /**
   * Creates a new ZSTD decoder instance.
   * 
   * @param options - Decoder configuration options
   */
  constructor(options?: DecoderOptions);
  
  /**
   * Initializes the decoder WebAssembly module.
   * 
   * @param wasmModule - Compiled WebAssembly module
   * @returns Promise that resolves to the initialized decoder
   */
  init(wasmModule: WebAssembly.Module): Promise<ZstdDecoder>;
  
  /**
   * Decompresses data synchronously.
   * 
   * @param compressedData - ZSTD compressed data
   * @param expectedSize - Expected size of the decompressed data
   * @returns Decompressed data
   */
  decompressSync(compressedData: Uint8Array, expectedSize?: number): Uint8Array;
  
  /**
   * Decompresses data using the streaming API.
   * 
   * @param input - Chunk of compressed data
   * @param reset - Whether to reset the decompression context
   * @returns Stream result with decompressed buffer and offset metadata
   */
  decompressStream(input: Uint8Array, reset?: boolean): StreamResult;
  
  /**
   * Cleans up decoder resources.
   */
  destroy(): void;
}
