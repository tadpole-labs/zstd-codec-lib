/**
 * Zstd WASM Decoder - Inlined WASM variant
 *
 * WASM is pre-compressed with deflate-raw level 7, encoded as base64,
 * then decompressed at runtime using DecompressionStream
 */
import ZstdDecoder from './zstd-wasm.js';
import { _DecompressionStream } from './decompression-stream.js';
/**
 * DecompressionStream wrapper for "zstd" format
 * Each stream gets its own decoder instance
 */
export declare class DecompressionStream extends _DecompressionStream {
    constructor(format: string);
}
export declare const decompress: (input: Uint8Array | ArrayBuffer) => Promise<Uint8Array>;
export declare const decompressStream: (input: Uint8Array | ArrayBuffer, reset?: boolean) => Promise<import("./types.js").StreamResult>;
export declare const decompressSync: (input: Uint8Array | ArrayBuffer, expectedSize?: number) => Promise<Uint8Array>;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
