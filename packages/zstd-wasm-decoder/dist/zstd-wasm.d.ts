import type { DecoderOptions, StreamResult } from './types.js';
declare class ZstdDecoder {
    private _wasm;
    private _exports;
    private _memory;
    private _HEAPU8;
    private _view;
    private _options;
    private _dctx;
    private _ddict?;
    private _srcPtr;
    private _dstPtr;
    private _streamInputStructPtr;
    private _streamOutputStructPtr;
    private _hasGrown;
    private _bufferSrcSize;
    private _bufferDstSize;
    constructor(options?: DecoderOptions);
    /**
     * Initialize with a compiled WebAssembly module
     */
    init(wasmModule: WebAssembly.Module): Promise<ZstdDecoder>;
    /**
     * Allocate memory in WASM module
     */
    private _malloc;
    private _growMemory;
    /**
     * Simple high-level API: Decompress a buffer synchronously
     *
     * @param compressedData - Compressed data
     * @param expectedSize - Optional expected decompressed size. If not provided, falls back to streaming.
     * @returns Decompressed data
     */
    decompressSync(compressedData: Uint8Array | Buffer, expectedSize?: number): Uint8Array;
    /**
     * Write 3 consecutive uint32 values to WASM heap (little-endian)
     * Writes values at offsets 0, 4, and 8 from the base pointer
     */
    private _writeStruct;
    private _isError;
    /**
     * Streaming decompression - can be fed chunks incrementally
     *
     * @param input - Input chunk
     * @param reset - Reset stream for new decompression (default: false)
     * @returns Decompression result with buffer, code, and input offset
     */
    decompressStream(input: Uint8Array | Buffer, reset?: boolean): StreamResult;
    /**
     * Read uint32 from WASM heap (little-endian)
     */
    private _readU32;
    /**
     * Concatenate Uint8Arrays (for browser compatibility)
     */
    private _concatUint8Arrays;
    freeDCtx(dctx: number): number;
    /**
     * Create a dictionary for decompression
     */
    private createDDict;
    freeDDict(ddict: number): number;
}
export default ZstdDecoder;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
