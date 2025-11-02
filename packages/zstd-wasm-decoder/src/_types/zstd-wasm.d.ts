import type { DecoderOptions, StreamResult } from './types.js';
declare class ZstdDecoder {
    private _wasm;
    private _exports;
    private _memory;
    private _HEAPU8;
    private _HEAPU32;
    private readonly _options;
    private _streamInputStructPtr;
    private _streamOutputStructPtr;
    private _ddict;
    private _srcPtr;
    private _dstPtr;
    private _bufferDstSize;
    constructor(options?: DecoderOptions);
    /**
     * Initialize with a compiled WebAssembly module
     */
    init(wasmModule: WebAssembly.Module): ZstdDecoder;
    /**
     * Initialize with an existing WebAssembly instance
     */
    _initWithInstance(wasmInstance: WebAssembly.Instance, _wasmModule?: WebAssembly.Module): ZstdDecoder;
    private _initCommon;
    /**
     * Allocate memory in WASM module
     */
    private _malloc;
    /**
     * Simple API: Decompress a buffer synchronously
     * Falls back to asynchronous compression if the expected size
     * is not hinted in advance.
     *
     * From measurements taken, it is more efficient to fallback
     * to streaming than to attempt to infer the expected size from the headers.
     *
     * @param compressedData - Compressed data
     * @param expectedSize - Optional expected decompressed size. If not provided, falls back to streaming.
     * @returns Decompressed data
     */
    decompressSync(compressedData: Uint8Array, expectedSize?: number): Uint8Array;
    /**
     * Optimized struct write using Uint32Array when properly aligned / (JIT)
     */
    private _writeStreamStruct;
    /**
     * Optimized struct read using Uint32Array
     */
    private _readStreamPos;
    /**
     * Streadming decompression - can be fed chunks incrementally
     *
     * @param input - Input chunk
     * @param reset - Reset stream for new decompression (default: false)
     * @returns Decompression result with buffer, code, and input offset
     */
    decompressStream(input: Uint8Array, reset?: boolean): StreamResult;
    /**
     * Clean up ZSTD contexts
     */
    destroy(): void;
}
export default ZstdDecoder;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
//# sourceMappingURL=zstd-wasm.d.ts.map