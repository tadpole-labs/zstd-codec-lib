import type { DecoderWasmExports, DecoderOptions, StreamResult } from './types.js';
import { _concatUint8Arrays } from './shared.js';
import { _fss } from './utils.js';
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
 * ║            │    │ ZSTD_inBuffer (12b)     │     │            ║
 * ║            │    │ - srcPtr  (4 bytes)     │     │            ║
 * ║            │    │ - size    (4 bytes)     │     │            ║
 * ║            │    │ - pos     (4 bytes)     │     │            ║
 * ║            │    ├─────────────────────────┤     │            ║
 * ║            │    │ ZSTD_outBuffer (12b)    │     │            ║
 * ║            │    │ - dstPtr  (4 bytes)     │     │            ║
 * ║            │    │ - size    (4 bytes)     │     │            ║
 * ║            │    │ - pos     (4 bytes)     │     │            ║
 * ║            │    └─────────────────────────┘     │            ║
 * ║    +24b    ├────────────────────────────────────┤            ║
 * ║            │    Source Buffer (2 MB)            │            ║
 * ║            │    (Compressed input staging)      │            ║
 * ║    +2MB    ├────────────────────────────────────┤            ║
 * ║            │    Destination Buffer (8.4 MB)     │            ║
 * ║            │    + 1mb margin                    │            ║
 * ║            │  Sized for level 19 compression:   │            ║
 * ║            │  windowSize (8MB) + 3*blockSize    │            ║
 * ║            │  (384KB) + 64 bytes                │            ║
 * ║  +9.4MB    └────────────────────────────────────┘            ║
 * ║                                                              ║
 * ║ Total: ~13.5 MB (with dict), ~11.5 MB (without dict)         ║
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

const _MAX_DST_BUF = 9830464;  // 9.37 MB
const _MAX_SRC_BUF = 2 * 1024 * 1024;  // 2 MB input buffer
const _STREAM_RESULT: StreamResult = { buf: new Uint8Array(0), in_offset: 0 };
class ZstdDecoder {
  private _wasm!: WebAssembly.Instance;
  private _exports!: DecoderWasmExports;
  private _memory!: WebAssembly.Memory;
  private _HEAPU8!: Uint8Array;
  private _HEAPU32!: Uint32Array;
  
  private readonly _options: {
    dictionary?: Uint8Array;
    maxSrcSize: number;
    maxDstSize: number;
  };

  // Memory pointers
  private _streamInputStructPtr: number = 0;
  private _streamOutputStructPtr: number = 0;
  private _ddict: number = 0;
  private _srcPtr: number = 0;
  private _dstPtr: number = 0;

  private _bufferDstSize: number = _MAX_DST_BUF;
  
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
    this._wasm = new WebAssembly.Instance(wasmModule, { env: {} });;
    return this._initCommon();
  }

  /**
   * Initialize with an existing WebAssembly instance
   */
  _initWithInstance(wasmInstance: WebAssembly.Instance, _wasmModule?: WebAssembly.Module): ZstdDecoder {
    this._wasm = wasmInstance;
    return this._initCommon();
  }

  private _initCommon(): ZstdDecoder {
    this._exports = this._wasm.exports as unknown as DecoderWasmExports;
    this._memory = (this._wasm.exports).memory as WebAssembly.Memory;

    this._HEAPU8 = new Uint8Array(this._memory.buffer);
    this._HEAPU32 = new Uint32Array(this._memory.buffer);

    // Reserve space for the streaming buffer structs:
    // - ZSTD_inBuffer (12 bytes): { srcPtr, size, pos }
    // - ZSTD_outBuffer (12 bytes): { dstPtr, size, pos }
    // We'll keep both structs contiguous in memory.
    // Allocate 24 bytes for both structs in one go
    this._streamInputStructPtr = this._malloc(24);
    // Output buffer struct goes after input's 12 bytes. Only 1 malloc at startup
    this._streamOutputStructPtr = this._streamInputStructPtr + 12;

    this._exports.createDCtx();

    // Initialize dictionary if provided
    if (this._options.dictionary) {
      const _dictLen = this._options.dictionary.length
      if (_dictLen > _MAX_SRC_BUF*2) {
        throw new Error('dict>2mb max size');
      }
      const dictPtr = this._malloc(_dictLen);
      this._HEAPU8.set(this._options.dictionary as Uint8Array, dictPtr);
      this._ddict = this._exports.createDict(dictPtr, _dictLen);
    }
    this._srcPtr = this._malloc(_MAX_SRC_BUF);
    this._dstPtr = this._srcPtr + _MAX_SRC_BUF // We don't malloc dst buf. Its where dst buf starts. Zstd will malloc
    return this;
  }

  /**
   * Allocate memory in WASM module
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
    if (!this._exports) throw new Error('module not initialized');
    
    const srcSize = compressedData.length;
    
    if (srcSize > this._options.maxSrcSize ) {
      throw new Error(`comp data ${srcSize}b>maxSrcSize lim ${this._options.maxSrcSize}b)`);
    }
    
    // No expected size => Use streaming
    if(!expectedSize) expectedSize = _fss(compressedData)

    if (!expectedSize || expectedSize > _MAX_DST_BUF || srcSize > _MAX_SRC_BUF) {
      return this.decompressStream(compressedData, true).buf;
    }
    
    this._HEAPU8.set(compressedData as Uint8Array, this._srcPtr);
    this._exports.prune_buf(this._dstPtr);
    const _dstPtr = this._dstPtr
    const result = this._exports.decompressSync(
      _dstPtr,
      this._bufferDstSize,
      this._srcPtr,
      srcSize,
      this._ddict
    );

    if (result < 0) {
      throw new Error(`decomp failed err ${result}`);
    }
    return this._HEAPU8.slice(_dstPtr, _dstPtr + result);
  }


  /**
   * Optimized struct write using Uint32Array when properly aligned / (JIT)
   */
  private _writeStreamStruct(ptr: number, bufPtr: number, size: number): void {
    const u32Index = ptr >>> 2;
    this._HEAPU32[u32Index] = bufPtr;
    this._HEAPU32[u32Index + 1] = size;
    this._HEAPU32[u32Index + 2] = 0;
  }
  
  /**
   * Optimized struct read using Uint32Array
   */
  private _readStreamPos(ptr: number): number {
    return this._HEAPU32[(ptr + 8) >>> 2];
  }

  /**
   * Streadming decompression - can be fed chunks incrementally
   * 
   * @param input - Input chunk
   * @param reset - Reset stream for new decompression (default: false)
   * @returns Decompression result with buffer, code, and input offset
   */
  decompressStream(input: Uint8Array, reset = false): StreamResult {
    if (!this._exports) throw new Error('WASM module not initialized');
    
    // Reset stream state for new decompression - ZSTD_reset_session_only = 1
    if (reset) {
      this._exports.reset();

      if (this._ddict) this._exports.refDict(this._ddict);

      this._exports.prune_buf(this._dstPtr);
    }
    let _STREAM_RESULT_OUT = _STREAM_RESULT
    if (!input || input.length === 0) return _STREAM_RESULT_OUT;

    const output: Uint8Array[] = [];
    
    let totalOutputSize = 0;
    let offset = 0;

    // const 128kb less overhead than adaptive input
    const suggestedInputSize = 131075; //ZSTD_BLOCKSIZE_MAX + ZSTD_BLOCKHEADERSIZE (131072 + 3)

    // Assuming 4-8x compressability in the average case
    // Write src buf less.
    // Let 1mb - 128kb out buf accumulate before we flush it out back to js
    const dstBufStart = this._srcPtr + 262150 
    let dstOffset = dstBufStart;
    let dstMaxBuf = dstBufStart + 655360
    let lastOut = 0
    while (offset < input.length) {
      const toProcess = Math.min(Math.min(input.length - offset, suggestedInputSize), 262150);
      this._HEAPU8.set((input as Uint8Array).subarray(offset, offset + toProcess), this._srcPtr);
      
      this._writeStreamStruct(this._streamInputStructPtr, this._srcPtr, toProcess);

      if(dstOffset == dstBufStart) {
        this._writeStreamStruct(this._streamOutputStructPtr, dstOffset, 917501);
      }
      
      // Process all data in current block
      while (this._readStreamPos(this._streamInputStructPtr) < toProcess) {
        const result = this._exports.decStream(
          this._streamOutputStructPtr,
          this._streamInputStructPtr
        );
        
        if (result < 0) throw new Error(`decomp err ${result}`);
        
        const outputPos = this._readStreamPos(this._streamOutputStructPtr);
        
        totalOutputSize += dstOffset == dstBufStart ? outputPos : (outputPos - lastOut);
        lastOut = outputPos
        if (outputPos > 0) {

          dstOffset = dstBufStart + outputPos

          if(dstOffset >= dstMaxBuf) {
            output.push(this._HEAPU8.slice(dstBufStart, dstOffset));
            dstOffset = dstBufStart;
            this._writeStreamStruct(this._streamOutputStructPtr, dstOffset, 917501);
          }
          
          if (totalOutputSize > this._options.maxDstSize) {
            throw new Error(`decomp size ${totalOutputSize}b>maxDstSize lim ${this._options.maxDstSize}b`);
          }
        }
      }
      offset += toProcess;
    }
    if (dstOffset != dstBufStart) output.push(this._HEAPU8.slice(dstBufStart, dstOffset));
    _STREAM_RESULT_OUT = {
      buf: _concatUint8Arrays(output, totalOutputSize),
      in_offset: input.length,
    };
    return _STREAM_RESULT_OUT;
  }

  /**
   * Clean up ZSTD contexts
   */
  destroy(): void {
    //@ts-expect-error gc.
    this._ddict = this._srcPtr = this._dstPtr = this._streamInputStructPtr = this._streamOutputStructPtr = this._wasm = this._exports = this._memory = this._HEAPU8 = this._HEAPU32 = null;
  }
}

export default ZstdDecoder;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
