



export interface BaseWasmExports {
  memory: WebAssembly.Memory;
  bmalloc(size: number): number;
  prune_buf(new_size: number): void;
}

/**
 * WebAssembly exported functions from the ZSTD decoder module
 */
export interface DecoderWasmExports extends BaseWasmExports {
  /** Create a ZSTD decompression context */
  createDCtx(): void;
  
  /** Create a ZSTD dictionary for decompression */
  createDict(dictPtr: number, dictSize: number): number;
  
  /** Decompress data using a dictionary (dctx is static in WASM) */
  decompressSync(
    dstPtr: number,
    dstCapacity: number,
    srcPtr: number,
    srcSize: number,
    ddict: number
  ): number;
  
  /** Decompress a stream of data (dctx is static in WASM) */
  decStream(
    outputPtr: number,
    inputPtr: number
  ): number;
  
  /** Reset decompression context (uses static dctx in WASM) */
  reset(): number;
  
  /** Reference a dictionary in the decompression context (uses static dctx in WASM) */
  refDict(ddict: number): number;
}

/**
 * Configuration options for the ZSTD decoder
 */
export interface DecoderOptions {
  /** Optional dictionary for decompression */
  dictionary?: Uint8Array;
  
  /** Maximum source (compressed) buffer size in bytes */
  maxSrcSize?: number;
  
  /** Maximum destination (decompressed) buffer size in bytes */
  maxDstSize?: number;
}

/**
 * Options for decoder functions and streams
 */
export interface ZstdOptions {
  /** Optional dictionary for decompression */
  dictionary?: Uint8Array | ArrayBuffer | Request | string;
  
  /** Optional path to WASM module */
  wasmPath?: string;
}

/**
 * Result from a streaming decompression operation
 */
export interface StreamResult {
  /** Decompressed output buffer */
  buf: Uint8Array;
  
  /** Return code from ZSTD (0 = success, negative = error, positive = bytes remaining) */
  code: number;
  
  /** Offset into the input buffer indicating how much was consumed */
  in_offset: number;
}

/**
 * Decoder class for decompressing ZSTD-compressed data
 */
export declare class ZstdDecoder {
  /**
   * Create a new ZSTD decoder
   * @param options - Optional decoder configuration
   */
  constructor(options?: DecoderOptions);
  
  /**
   * Initialize the decoder with a WebAssembly module
   * @param wasmModule - Compiled WebAssembly module
   * @returns Promise that resolves to the initialized decoder
   */
  init(wasmModule: WebAssembly.Module): Promise<ZstdDecoder>;
  
  /**
   * Decompress data synchronously
   * @param compressedData - ZSTD compressed data
   * @param expectedSize - Optional hinted size of decompressed data
   * @returns Decompressed data as Uint8Array
   */
  decompressSync(compressedData: Uint8Array, expectedSize?: number): Uint8Array;
  
  /**
   * Decompress data using streaming API
   * @param input - Chunk of compressed data
   * @param reset - Whether to reset the decompression context
   * @returns Stream result with decompressed buffer and metadata
   */
  decompressStream(input: Uint8Array, reset?: boolean): StreamResult;
  
  /**
   * Clean up decoder resources
   */
  destroy(): void;
}
