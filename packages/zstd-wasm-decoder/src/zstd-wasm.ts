import type { WasmExports, DecoderOptions, StreamResult } from './types.js';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                        Memory Layout                         ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║   0x0000   ┌────────────────────────────────────┐            ║
 * ║            │      Stack Space (8 KB)            │            ║
 * ║   0x2000   ├────────────────────────────────────┤            ║
 * ║            │   ZSTD_DCtx Context (~64 KB)       │            ║
 * ║            │   (Decompression context +         │            ║
 * ║            │    workspace)                      │            ║
 * ║ ~0x12000   ├────────────────────────────────────┤            ║
 * ║            │   Dictionary (optional)            │            ║
 * ║            │   (up to 2 MB)                     │            ║
 * ║            │   (only allocated if provided)     │            ║
 * ║    +2MB    ├────────────────────────────────────┤            ║
 * ║            │  Stream Structs (24 bytes):        │            ║
 * ║            │    ┌─────────────────────────┐     │            ║
 * ║            │    │ ZSTD_inBuffer (12B)     │     │            ║
 * ║            │    │ - srcPtr  (4 bytes)     │     │            ║
 * ║            │    │ - size    (4 bytes)     │     │            ║
 * ║            │    │ - pos     (4 bytes)     │     │            ║
 * ║            │    ├─────────────────────────┤     │            ║
 * ║            │    │ ZSTD_outBuffer (12B)    │     │            ║
 * ║            │    │ - dstPtr  (4 bytes)     │     │            ║
 * ║            │    │ - size    (4 bytes)     │     │            ║
 * ║            │    │ - pos     (4 bytes)     │     │            ║
 * ║            │    └─────────────────────────┘     │            ║
 * ║    +24B    ├────────────────────────────────────┤            ║
 * ║            │    Source Buffer (1 MB)            │            ║
 * ║            │    (Compressed input staging)      │            ║
 * ║    +1MB    ├────────────────────────────────────┤            ║
 * ║            │    Destination Buffer (8.4 MB)     │            ║
 * ║            │                                    │            ║
 * ║            │  Sized for level 19 compression:   │            ║
 * ║            │  windowSize (8MB) + 3*blockSize    │            ║
 * ║            │  (384KB) + 64 bytes                │            ║
 * ║  +8.4MB    └────────────────────────────────────┘            ║
 * ║                                                              ║
 * ║ Total: ~11.5 MB (with dict), ~9.5 MB (without dict)          ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                         Notes                                ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║ • This memory layout supports decompression of files         ║
 * ║   compressed at any level up to lvl 19                       ║
 * ║                                                              ║
 * ║ • Input/output does NOT have to fit within these buffer      ║
 * ║   limits. As long as user-configured maxSrcSize & maxDstSize ║
 * ║   aren't crossing the limits, we can decompress arbitrarily  ║
 * ║   large files through streaming                              ║
 * ║                                                              ║
 * ║ • For small files that fit in the buffers, we use fast sync  ║
 * ║   decompression. For larger files, we automatically fallback ║
 * ║   to streaming decompression                                 ║
 * ║                                                              ║
 * ║ • Memory is managed primarily from JS by resetting buffer    ║
 * ║   pointers back to dstPtr at every freshly initialized       ║
 * ║   stream, avoiding WASM heap growth                          ║
 * ║                                                              ║
 * ║ • The WASM memory can grow into the JS runtime if needed,    ║
 * ║   but we size the initial allocation to handle most common   ║
 * ║   cases without heap growth needed at all                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */


/**
 *    
 *    https://github.com/facebook/zstd/blob/release/lib/decompress/zstd_decompress.c#L1980
 * 
 *    Level 19 memory requirements:
 *
 *  - windowSize:          8 MB     8 * 1024 * 1024 bytes
 * 
 *  - 3 * blockSize:     384 KB     3 * 128 KB = 384 KB = 3 * 131072 bytes
 * 
 *  - Safety margin:   64 bytes     for fast memcpy functions that may
 *                                  read/write slightly out of bounds
 *
 *    Total Memory = blockSize + (windowSize + 2 * blockSize + 2 * WILDCOPY_OVERLENGTH)
 * 
 *
 *    Other relevant sources:
 *      - Zstandard decompressor errata:
 *          https://github.com/facebook/zstd/blob/release/doc/decompressor_errata.md
 *      - Permissiveness / Edge-Cases:
 *          https://github.com/facebook/zstd/blob/release/doc/decompressor_permissive.md
 *      - Zstd manual:
 *          https://facebook.github.io/zstd/zstd_manual.html
 */


const _MAX_DST_BUF = 8*1024*1024;  // 8.4 MB
const _MAX_SRC_BUF = 1024 * 1024;  // 1 MB input buffer
class ZstdDecoder {
  private _wasm!: WebAssembly.Instance;
  private _exports!: WasmExports;
  private _memory!: WebAssembly.Memory;
  private _HEAPU8!: Uint8Array;
  private _HEAPU32!: Uint32Array;
  private _view!: DataView;
  
  // Configuration
  private readonly _options: {
    dictionary?: Uint8Array;
    maxSrcSize: number;
    maxDstSize: number;
  };
  
  // Decompression context
  private _dctx: number = 0;
  private _ddict: number = 0;
  
  // Memory pointers
  private _srcPtr: number = 0;
  private _dstPtr: number = 0;
  private _streamInputStructPtr: number = 0;
  private _streamOutputStructPtr: number = 0;
  
  // Memory management state
  private _bufferSrcSize: number = 0;
  private _bufferDstSize: number = 0;
  
  constructor(options: DecoderOptions = {}) {
    this._options = {
      dictionary: options.dictionary,
      maxSrcSize: options.maxSrcSize || 0,
      maxDstSize: options.maxDstSize || 0
    };
  }

  /**
   * Initialize with a compiled WebAssembly module
   */
  init(wasmModule: WebAssembly.Module): ZstdDecoder {
    const instance = new WebAssembly.Instance(wasmModule, { env: {} });
    this._wasm = instance;
    this._exports = instance.exports as unknown as WasmExports;
    this._memory = (instance.exports as any).memory as WebAssembly.Memory;

    this._HEAPU8 = new Uint8Array(this._memory.buffer);
    this._HEAPU32 = new Uint32Array(this._memory.buffer);
    this._view = new DataView(this._memory.buffer);
    
    this._dctx = this._exports.createDCtx();

    // Initialize dictionary if provided
    if (this._options.dictionary) {
      if (this._options.dictionary.length > _MAX_SRC_BUF*2) {
        throw new Error('dict>2mb max size');
      }
      this._ddict = this._createDict(this._options.dictionary);
    }
    
    // Reserve space for the streaming buffer structs:
    // - ZSTD_inBuffer (12 bytes): { srcPtr, size, pos }
    // - ZSTD_outBuffer (12 bytes): { dstPtr, size, pos }
    // We'll keep both structs contiguous in memory.
    // Allocate 24 bytes for both structs in one go
    this._streamInputStructPtr = this._malloc(24);      
    // Output buffer struct goes after input's 12 bytes
    this._streamOutputStructPtr = this._streamInputStructPtr + 12; 
    this._bufferSrcSize = _MAX_SRC_BUF;
    this._bufferDstSize = _MAX_DST_BUF;
    this._srcPtr = this._malloc(this._bufferSrcSize);
    this._dstPtr = this._srcPtr + this._bufferSrcSize;
    return this;
  }

  /**
   * Allocate memory in WASM module with alignment check
   */
  private _malloc(size: number): number {
    return this._exports.bmalloc(size);
  }

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
  decompressSync(compressedData: Uint8Array, expectedSize?: number): Uint8Array {
    if (!this._exports) {
      throw new Error('module not initialized');
    }
    
    const srcSize = compressedData.length;
    
    if (srcSize > this._options.maxSrcSize) {
      throw new Error(`comp data ${srcSize}b>maxSrcSize lim ${this._options.maxSrcSize}b)`);
    }
    
    // No expected size => Use streaming
    if (!expectedSize || expectedSize > _MAX_DST_BUF) {
      return this.decompressStream(compressedData, true).buf;
    }

    this._HEAPU8.set(compressedData as Uint8Array, this._srcPtr);
    const result = this._exports._decompressSync(
      this._dctx,
      this._dstPtr,
      this._bufferDstSize,
      this._srcPtr,
      srcSize,
      this._ddict || 0
    );

    if (this._isError(result)) {
      throw new Error(`decomp failed err ${result}`);
    }
    
    return this._HEAPU8.slice(this._dstPtr, this._dstPtr + result);
  }

  private _isError(code: number): boolean {
    return this._exports.isError(code) !== 0;
  }

  /**
   * Optimized struct write using Uint32Array when properly aligned
   * assuming little-endian host.
   */
  private _writeStreamStruct(ptr: number, bufPtr: number, size: number, pos: number = 0): void {
    const u32Index = ptr >>> 2;
    this._HEAPU32[u32Index] = bufPtr;
    this._HEAPU32[u32Index + 1] = size;
    this._HEAPU32[u32Index + 2] = pos;
  }
  
  /**
   * Optimized struct read using Uint32Array when properly aligned
   */
  private _readStreamPos(ptr: number): number {
    return this._HEAPU32[(ptr + 8) >>> 2];
  }

  /**
   * Streaming decompression - can be fed chunks incrementally
   * 
   * @param input - Input chunk
   * @param reset - Reset stream for new decompression (default: false)
   * @returns Decompression result with buffer, code, and input offset
   */
  decompressStream(input: Uint8Array, reset = false): StreamResult {
    if (!this._exports) throw new Error('WASM module not initialized');
    
    // Reset stream state for new decompression - ZSTD_reset_session_only = 1
    if (reset) {
      this._exports.reset(this._dctx);

      if (this._ddict) this._exports.refDict(this._dctx, this._ddict);

      this._exports.prune_buf(this._dstPtr);
    }
    
    if (!input || input.length === 0) {
      return { buf: new Uint8Array(0), code: 0, in_offset: 0 };
    }

    const output: Uint8Array[] = [];
    
    let totalOutputSize = 0;
    let offset = 0;
    let suggestedInputSize = 131075; //ZSTD_BLOCKSIZE_MAX + ZSTD_BLOCKHEADERSIZE (131072 + 3)

    // ZSTD_outBuffer ptr 
    const dstOffset = this._srcPtr + suggestedInputSize;
    
    while (offset < input.length) {
      const toProcess = Math.min(input.length - offset, 131075); // ZSTD_BLOCKSIZE_MAX + ZSTD_BLOCKHEADERSIZE (131072 + 3)
      this._HEAPU8.set((input as Uint8Array).subarray(offset, offset + toProcess), this._srcPtr);
      
      this._writeStreamStruct(this._streamInputStructPtr, this._srcPtr, toProcess, 0);
      
      // Process all data in current block
      while (this._readStreamPos(this._streamInputStructPtr) < toProcess) {
        // Set output struct to ZSTD_BLOCKSIZE_MAX = (1 << 17)
        this._writeStreamStruct(this._streamOutputStructPtr, dstOffset, 131072, 0);
        
        // result is: 0 if frame complete, >0 for suggested next input size, or error
        const result = this._exports.decStream(
          this._dctx,
          this._streamOutputStructPtr,
          this._streamInputStructPtr
        );
        
        if (this._isError(result)) throw new Error(`decomp err ${result}`);
        
        const outputPos = this._readStreamPos(this._streamOutputStructPtr);
        if (outputPos > 0) {
          totalOutputSize += outputPos;
          if (totalOutputSize > this._options.maxDstSize) {
            throw new Error(`decomp size ${totalOutputSize}b>maxDstSize lim ${this._options.maxDstSize}b`);
          }
          output.push(this._HEAPU8.slice(dstOffset, dstOffset + outputPos));
        }

        // Hinted on return for the next iteration
        if (result > 0 && result < 131075) suggestedInputSize = result;
      }
      
      offset += toProcess;
    }
    
    let resultBuf = this._concatUint8Arrays(output);
    
    return { 
      buf: resultBuf,
      code: 0, // 0 = success/needs more input
      in_offset: input.length
    };
  }

  /**
   * Concatenate Uint8Arrays
   */
  private _concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(arrays.reduce((acc, arr) => acc + arr.length, 0));
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  /**
   * Create a dictionary for decompression
   */
  private _createDict(dictData: Uint8Array): number {
    const dictPtr = this._malloc(dictData.length);
    this._HEAPU8.set(dictData as Uint8Array, dictPtr);
    return this._exports.createDict(dictPtr, dictData.length);
  }
}

export default ZstdDecoder;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
