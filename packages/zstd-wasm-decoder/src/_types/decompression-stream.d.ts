/**
 * DecompressionStream polyfill that extends native support with "zstd" format
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream
 */
import type ZstdDecoder from './zstd-wasm.js';
/**
 * DecompressionStream that supports both native formats and "zstd"
 * Usage:
 *   - new DecompressionStream("gzip")  -> native browser API
 *   - new DecompressionStream("zstd")  -> polyfilled WASM module
 */
export declare class _DecompressionStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    constructor(format: string, _ensureInit: () => Promise<ZstdDecoder>);
}
//# sourceMappingURL=decompression-stream.d.ts.map