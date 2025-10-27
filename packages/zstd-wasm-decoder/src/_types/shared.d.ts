import ZstdDecoder from './zstd-wasm.js';
import { _DecompressionStream } from './decompression-stream.js';
import type { StreamResult } from './types.js';
export { default as ZstdDecoder } from './zstd-wasm.js';
export type { DecoderOptions, StreamResult } from './types.js';
/**
 * Options for decoder functions
 */
interface CreateDecoderOptions {
    dictionary?: Uint8Array | ArrayBuffer | Request | string;
    wasmPath?: string;
}
export declare const _internal: {
    loader: ((wasmPath?: string) => WebAssembly.Module) | null;
};
/**
 * Create a decoder instance
 */
export declare function createDecoder(options?: CreateDecoderOptions): ZstdDecoder;
/**
 * DecompressionStream supporting whatwg standards and zstd
 */
export declare class DecompressionStream extends _DecompressionStream {
    constructor(format: string, options?: CreateDecoderOptions);
}
/**
 * Decompress data completely
 */
export declare function decompress(input: Uint8Array, options?: CreateDecoderOptions): Uint8Array;
/**
 * Decompress data as a stream (for chunked processing)
 */
export declare function decompressStream(input: Uint8Array, reset?: boolean, options?: CreateDecoderOptions): StreamResult;
/**
 * Decompress data synchronously (when expected size is known)
 */
export declare function decompressSync(input: Uint8Array, expectedSize?: number, options?: CreateDecoderOptions): Uint8Array;
//# sourceMappingURL=shared.d.ts.map