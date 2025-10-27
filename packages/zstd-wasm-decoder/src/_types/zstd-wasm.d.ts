import type { DecoderOptions, StreamResult } from './types.js';
declare class ZstdDecoder {
    private _wasm;
    private _exports;
    private _memory;
    private _HEAPU8;
    private _HEAPU32;
    private _view;
    private readonly _options;
    private _dctx;
    private _ddict;
    private _srcPtr;
    private _dstPtr;
    private _streamInputStructPtr;
    private _streamOutputStructPtr;
    private _bufferSrcSize;
    private _bufferDstSize;
    constructor(options?: DecoderOptions);
    /**
     * Initialize with a compiled WebAssembly module
     */
    init(wasmModule: WebAssembly.Module): ZstdDecoder;
    /**
     * Allocate memory in WASM module with alignment check
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
    private _isError;
    /**
     * Optimized struct write using Uint32Array when properly aligned
     * assuming little-endian host.
     */
    private _writeStreamStruct;
    /**
     * Optimized struct read using Uint32Array when properly aligned
     */
    private _readStreamPos;
    /**
     * Streaming decompression - can be fed chunks incrementally
     *
     * @param input - Input chunk
     * @param reset - Reset stream for new decompression (default: false)
     * @returns Decompression result with buffer, code, and input offset
     */
    decompressStream(input: Uint8Array, reset?: boolean): StreamResult;
    /**
     * Concatenate Uint8Arrays
     */
    private _concatUint8Arrays;
    /**
     * Create a dictionary for decompression
     */
    private _createDict;
}
export default ZstdDecoder;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
//# sourceMappingURL=zstd-wasm.d.ts.map