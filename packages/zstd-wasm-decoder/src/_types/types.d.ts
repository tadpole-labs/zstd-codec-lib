/**
 * WebAssembly exported functions from the ZSTD decoder module
 */
export interface WasmExports {
  /** WebAssembly linear memory */
  memory: WebAssembly.Memory;
  
  /** Create a ZSTD decompression context */
  createDCtx(): number;
  
  /** Create a ZSTD dictionary for decompression */
  createDict(dictPtr: number, dictSize: number): number;
  
  /** Decompress data using a dictionary */
  _decompressSync(
    dctx: number,
    dstPtr: number,
    dstCapacity: number,
    srcPtr: number,
    srcSize: number,
    ddict: number
  ): number;
  
  /** Decompress a stream of data */
  decStream(
    dctx: number,
    outputPtr: number,
    inputPtr: number
  ): number;
  
  /** Reset decompression context */
  reset(dctx: number): number;
  
  /** Reference a dictionary in the decompression context */
  refDict(dctx: number, ddict: number): number;
  
  /** Check if a return code is an error */
  isError(code: number): number;
  
  /** Allocate memory in WASM */
  bmalloc(size: number): number;
  
  /** Prune the internal buffer to a new size */
  prune_buf(new_size: number): void;
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
 * Interface for ZSTD decoder operations
 */
export interface ZstdDecoderInterface {
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
}

/**
 * Decoder class for decompressing ZSTD-compressed data
 */
export declare class ZstdDecoder implements ZstdDecoderInterface {
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
}
