import ZstdDecoder from './zstd-wasm.js';
export { default as ZstdDecoder, _MAX_SRC_BUF } from './zstd-wasm.js';
import type { StreamResult, ZstdOptions } from './types.js';
export declare const _internal: {
    _loader: ((wasmPath?: string) => WebAssembly.Module | Promise<WebAssembly.Module>) | null;
    bufSizes: {
        maxSrcSize: number;
        maxDstSize: number;
    };
    dictionaries: string[];
};
export declare const setupZstdDecoder: (options: {
    maxSrcSize?: number;
    maxDstSize?: number;
    dictionaries?: string[];
}) => Promise<void>;
export declare function _concatUint8Arrays(arrays: Uint8Array[], ol: number): Uint8Array;
export declare function _pushToPool(decoder: ZstdDecoder, module: WebAssembly.Module, dictId?: number): void;
/**
 * Create a decoder instance
 */
export declare const createDecoder: (options?: ZstdOptions) => Promise<ZstdDecoder>;
/**
 * ZstdDecompressionStream
 */
export declare class ZstdDecompressionStream {
    readonly readable: ReadableStream;
    readonly writable: WritableStream;
    constructor(options?: ZstdOptions);
}
/**
 * Decompress data in-full
 * (Proxies to decompressStream and returns the buf)
 */
export declare const decompress: (input: Uint8Array, options?: ZstdOptions) => Promise<Uint8Array>;
/**
 * Decompress data as a stream
 */
export declare const decompressStream: (input: Uint8Array, reset?: boolean, options?: ZstdOptions) => Promise<StreamResult>;
/**
 * Decompress data synchronously (when expected size is known)
 */
export declare const decompressSync: (input: Uint8Array, expectedSize?: number, options?: ZstdOptions) => Promise<Uint8Array>;
//# sourceMappingURL=shared.d.ts.map