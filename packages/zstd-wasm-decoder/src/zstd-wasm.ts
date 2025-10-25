import type { WasmExports, DecoderOptions, StreamResult } from './types.js';

const _MAX_DST_BUF = 4 * 1024 * 1024;
const _MAX_SRC_BUF = _MAX_DST_BUF / 8;

class ZstdDecoder {
  private _wasm!: WebAssembly.Instance;
  private _exports!: WasmExports;
  private _memory!: WebAssembly.Memory;
  private _HEAPU8!: Uint8Array;
  private _view!: DataView;
  
  private _options: {
    dictionary?: Uint8Array | Buffer;
    maxSrcSize: number;
    maxDstSize: number;
  };
  
  // Internal state
  private _dctx!: number;
  private _ddict?: number;
  private _srcPtr!: number;
  private _dstPtr!: number;
  private _streamInputStructPtr!: number;
  private _streamOutputStructPtr!: number;
  
  // Memory management state
  private _hasGrown: boolean = false;
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
  async init(wasmModule: WebAssembly.Module): Promise<ZstdDecoder> {
    const instance = await WebAssembly.instantiate(wasmModule, { env: {} }) as unknown as WebAssembly.Instance;
    this._wasm = instance;
    this._exports = instance.exports as unknown as WasmExports;
    this._memory = (instance.exports as any).memory as WebAssembly.Memory;
    this._HEAPU8 = new Uint8Array(this._memory.buffer);
    this._view = new DataView(this._memory.buffer);

    if (this._options.dictionary) {
      if (this._options.dictionary.length > _MAX_SRC_BUF / 4) {
        throw new Error('Dictionary exceeds 2MB maximum size');
      }
      this._ddict = this.createDDict(this._options.dictionary);
    }
    
    this._dctx = this._exports._ZSTD_createDCtx();
    this._streamInputStructPtr = this._malloc(16);
    this._streamOutputStructPtr = this._malloc(16);
    this._growMemory(false);
    return this;
  }

  /**
   * Allocate memory in WASM module
   */
  private _malloc(size: number): number {
    if (!this._exports) throw new Error('WASM module not initialized');
    return this._exports.wasm_malloc(size);
  }
  
  private _growMemory(grow: boolean): void {
    const mul = grow ? 1 : 2;
    this._bufferSrcSize = _MAX_SRC_BUF * mul;
    this._bufferDstSize = (_MAX_DST_BUF / 2) * mul;
    this._dstPtr = this._malloc(this._bufferDstSize);
    this._srcPtr = this._malloc(this._bufferSrcSize);
    this._hasGrown = grow;
  }

  /**
   * Simple high-level API: Decompress a buffer synchronously
   * 
   * @param compressedData - Compressed data
   * @param expectedSize - Optional expected decompressed size. If not provided, falls back to streaming.
   * @returns Decompressed data
   */
  decompressSync(compressedData: Uint8Array | Buffer, expectedSize?: number): Uint8Array {
    if (!this._exports) {
      throw new Error('WASM module not initialized');
    }
    
    const srcSize = compressedData.length;
    
    if (srcSize > this._options.maxSrcSize) {
      throw new Error(`Compressed data (${srcSize} bytes) exceeds maxSrcSize limit (${this._options.maxSrcSize} bytes)`);
    }
    
    // No expected size => Use streaming
    if (!expectedSize || expectedSize > _MAX_DST_BUF) {
      return this.decompressStream(compressedData, true).buf;
    }

    if (!this._hasGrown && srcSize > _MAX_SRC_BUF) {
      this._growMemory(true);
    }

    this._HEAPU8.set(compressedData as Uint8Array, this._srcPtr);
    const result = this._exports._ZSTD_decompress_usingDDict(
      this._dctx,
      this._dstPtr,
      this._bufferDstSize,
      this._srcPtr,
      srcSize,
      this._ddict || 0
    );

    if (this._isError(result)) {
      throw new Error(`Decompression failed (error code: ${result})`);
    }
    
    return this._HEAPU8.slice(this._dstPtr, this._dstPtr + result);
  }

  /**
   * Write 3 consecutive uint32 values to WASM heap (little-endian)
   * Writes values at offsets 0, 4, and 8 from the base pointer
   */
  private _writeStruct(ptr: number, val0: number, val1: number): void {
    this._view.setUint32(ptr, val0, true);
    this._view.setUint32(ptr + 4, val1, true);
    this._view.setUint32(ptr + 8, 0, true);
  }

  private _isError(code: number): boolean {
    if (!this._exports) throw new Error('WASM module not initialized');
    return this._exports._ZSTD_isError(code) !== 0;
  }

  /**
   * Streaming decompression - can be fed chunks incrementally
   * 
   * @param input - Input chunk
   * @param reset - Reset stream for new decompression (default: false)
   * @returns Decompression result with buffer, code, and input offset
   */
  decompressStream(input: Uint8Array | Buffer, reset = false): StreamResult {
    if (!this._exports) {
      throw new Error('WASM module not initialized');
    }
    
    if (reset) {
      // Reset stream state for new decompression - ZSTD_reset_session_only = 1
      this._exports._ZSTD_DCtx_reset(this._dctx, 1);
      if (this._ddict) {
        this._exports._ZSTD_DCtx_refDDict(this._dctx, this._ddict);
      }
    }
    
    if (!input || input.length === 0) {
      return { buf: new Uint8Array(0), code: 0, input_offset: 0 };
    }
    
    const output: Uint8Array[] = [];
    let offset = 0;
    let totalOutputSize = 0;
    
    while (offset < input.length) {
      const toProcess = Math.min(input.length - offset, 131075); // ZSTD_BLOCKSIZE_MAX + ZSTD_BLOCKHEADERSIZE (131072 + 3)
      this._HEAPU8.set((input as Uint8Array).subarray(offset, offset + toProcess), this._srcPtr);
      
      // Set input struct
      this._writeStruct(this._streamInputStructPtr, this._srcPtr, toProcess);
      
      // Process input
      while (this._readU32(this._streamInputStructPtr + 8) < toProcess) {
        // Set output struct
        this._writeStruct(this._streamOutputStructPtr, this._dstPtr, 131072); // ZSTD_BLOCKSIZE_MAX (1 << 17)
        
        const result = this._exports._ZSTD_decompressStream(
          this._dctx,
          this._streamOutputStructPtr,
          this._streamInputStructPtr
        );
        
        if (this._isError(result)) {
          throw new Error(`Decompression error (error code: ${result})`);
        }
        
        const outputPos = this._readU32(this._streamOutputStructPtr + 8);
        
        if (outputPos > 0) {
          totalOutputSize += outputPos;
          if (totalOutputSize > this._options.maxDstSize) {
            throw new Error(`Decompressed size (${totalOutputSize} bytes) exceeds maxDstSize limit (${this._options.maxDstSize} bytes)`);
          }
          
          output.push(this._HEAPU8.slice(this._dstPtr, this._dstPtr + outputPos));
        }
      }
      
      offset += toProcess;
    }

    return { 
      buf: output.length > 0 
        ? (typeof Buffer !== 'undefined' ? Buffer.concat(output) : this._concatUint8Arrays(output))
        : new Uint8Array(0),
      code: 0, // 0 = success/needs more input
      input_offset: input.length
    };
  }

  /**
   * Read uint32 from WASM heap (little-endian)
   */
  private _readU32(ptr: number): number {
    return this._view.getUint32(ptr, true);
  }

  /**
   * Concatenate Uint8Arrays (for browser compatibility)
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
  
  freeDCtx(dctx: number): number {
    if (!this._exports) throw new Error('WASM module not initialized');
    return this._exports._ZSTD_freeDCtx(dctx);
  }

  /**
   * Create a dictionary for decompression
   */
  private createDDict(dictData: Uint8Array | Buffer): number {
    const dictPtr = this._malloc(dictData.length);
    this._HEAPU8.set(dictData as Uint8Array, dictPtr);
    return this._exports._ZSTD_createDDict(dictPtr, dictData.length);
  }

  freeDDict(ddict: number): number {
    if (!this._exports) throw new Error('WASM module not initialized');
    return this._exports._ZSTD_freeDDict(ddict);
  }
}

export default ZstdDecoder;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
