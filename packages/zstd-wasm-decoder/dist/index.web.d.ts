import ZstdDecoder from './zstd-wasm.js';
import { _DecompressionStream } from './decompression-stream.js';
/**
 * DecompressionStream wrapper for "zstd" format
 * Each stream gets its own decoder instance
 */
export declare class DecompressionStream extends _DecompressionStream {
    constructor(format: string);
}
export declare const decompress: (input: Uint8Array | ArrayBuffer, options?: {
    dictionary?: Uint8Array;
}) => Promise<Uint8Array>;
export declare const decompressStream: (input: Uint8Array | ArrayBuffer, reset?: boolean, options?: {
    dictionary?: Uint8Array;
}) => Promise<import("./types.js").StreamResult>;
export declare const decompressSync: (input: Uint8Array | ArrayBuffer, expectedSize?: number, options?: {
    dictionary?: Uint8Array;
}) => Promise<Uint8Array>;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
