/**
 * Base WebAssembly exports.
 */
export interface BaseWasmExports {
  /** WebAssembly linear memory */
  memory: WebAssembly.Memory;

  /** Allocate memory in the WASM module */
  malloc(size: number): number;
  /** Prune the buffer to a new size */
  pb(new_size: number): void;
}

/*
 * Decoder specific exported functions.
 */
export interface DecoderWasmExports extends BaseWasmExports {
  /** Creates a ZSTD decompression context */
  _initialize(): void;

  /** Creates a ZSTD dictionary for decompression */
  cd(dictPtr: number, dictSize: number): number;

  /** Decompresses data synchronously */
  dS(dstPtr: number, dstCapacity: number, srcPtr: number, srcSize: number): number;

  /** Decompresses a stream of data */
  ds(): number;

  /** Resets the decompression context */
  re(): number;
}

/**
 * Configuration options for the ZSTD decoder.
 */
export interface DecoderOptions {
  /** Dictionary to use for decompression */
  dictionary?: Uint8Array;

  /** Maximum (compressed) buffer size in bytes */
  maxSrcSize?: number;

  /** Maximum (decompressed) buffer size in bytes */
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
