// src/zstd-wasm.ts
var _MAX_DST_BUF = 4 * 1024 * 1024;
var _MAX_SRC_BUF = _MAX_DST_BUF / 8;

class ZstdDecoder {
  _wasm;
  _exports;
  _memory;
  _HEAPU8;
  _view;
  _options;
  _dctx;
  _ddict;
  _srcPtr;
  _dstPtr;
  _streamInputStructPtr;
  _streamOutputStructPtr;
  _hasGrown = false;
  _bufferSrcSize = 0;
  _bufferDstSize = 0;
  constructor(options = {}) {
    this._options = {
      dictionary: options.dictionary,
      maxSrcSize: options.maxSrcSize || 0,
      maxDstSize: options.maxDstSize || 0
    };
  }
  async init(wasmModule) {
    const instance = await WebAssembly.instantiate(wasmModule, { env: {} });
    this._wasm = instance;
    this._exports = instance.exports;
    this._memory = instance.exports.memory;
    this._HEAPU8 = new Uint8Array(this._memory.buffer);
    this._view = new DataView(this._memory.buffer);
    if (this._options.dictionary) {
      if (this._options.dictionary.length > _MAX_SRC_BUF / 4) {
        throw new Error("Dictionary exceeds 2MB maximum size");
      }
      this._ddict = this.createDDict(this._options.dictionary);
    }
    this._dctx = this._exports._ZSTD_createDCtx();
    this._streamInputStructPtr = this._malloc(16);
    this._streamOutputStructPtr = this._malloc(16);
    this._growMemory(false);
    return this;
  }
  _malloc(size) {
    if (!this._exports)
      throw new Error("WASM module not initialized");
    return this._exports.wasm_malloc(size);
  }
  _growMemory(grow) {
    const mul = grow ? 1 : 2;
    this._bufferSrcSize = _MAX_SRC_BUF * mul;
    this._bufferDstSize = _MAX_DST_BUF / 2 * mul;
    this._dstPtr = this._malloc(this._bufferDstSize);
    this._srcPtr = this._malloc(this._bufferSrcSize);
    this._hasGrown = grow;
  }
  decompressSync(compressedData, expectedSize) {
    if (!this._exports) {
      throw new Error("WASM module not initialized");
    }
    const srcSize = compressedData.length;
    if (srcSize > this._options.maxSrcSize) {
      throw new Error(`Compressed data (${srcSize} bytes) exceeds maxSrcSize limit (${this._options.maxSrcSize} bytes)`);
    }
    if (!expectedSize || expectedSize > _MAX_DST_BUF) {
      return this.decompressStream(compressedData, true).buf;
    }
    if (!this._hasGrown && srcSize > _MAX_SRC_BUF) {
      this._growMemory(true);
    }
    this._HEAPU8.set(compressedData, this._srcPtr);
    const result = this._exports._ZSTD_decompress_usingDDict(this._dctx, this._dstPtr, this._bufferDstSize, this._srcPtr, srcSize, this._ddict || 0);
    if (this._isError(result)) {
      throw new Error(`Decompression failed (error code: ${result})`);
    }
    return this._HEAPU8.slice(this._dstPtr, this._dstPtr + result);
  }
  _writeStruct(ptr, val0, val1) {
    this._view.setUint32(ptr, val0, true);
    this._view.setUint32(ptr + 4, val1, true);
    this._view.setUint32(ptr + 8, 0, true);
  }
  _isError(code) {
    if (!this._exports)
      throw new Error("WASM module not initialized");
    return this._exports._ZSTD_isError(code) !== 0;
  }
  decompressStream(input, reset = false) {
    if (!this._exports) {
      throw new Error("WASM module not initialized");
    }
    if (reset) {
      this._exports._ZSTD_DCtx_reset(this._dctx, 1);
      if (this._ddict) {
        this._exports._ZSTD_DCtx_refDDict(this._dctx, this._ddict);
      }
    }
    if (!input || input.length === 0) {
      return { buf: new Uint8Array(0), code: 0, input_offset: 0 };
    }
    const output = [];
    let offset = 0;
    let totalOutputSize = 0;
    while (offset < input.length) {
      const toProcess = Math.min(input.length - offset, 131075);
      this._HEAPU8.set(input.subarray(offset, offset + toProcess), this._srcPtr);
      this._writeStruct(this._streamInputStructPtr, this._srcPtr, toProcess);
      while (this._readU32(this._streamInputStructPtr + 8) < toProcess) {
        this._writeStruct(this._streamOutputStructPtr, this._dstPtr, 131072);
        const result = this._exports._ZSTD_decompressStream(this._dctx, this._streamOutputStructPtr, this._streamInputStructPtr);
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
      buf: output.length > 0 ? typeof Buffer !== "undefined" ? Buffer.concat(output) : this._concatUint8Arrays(output) : new Uint8Array(0),
      code: 0,
      input_offset: input.length
    };
  }
  _readU32(ptr) {
    return this._view.getUint32(ptr, true);
  }
  _concatUint8Arrays(arrays) {
    const result = new Uint8Array(arrays.reduce((acc, arr) => acc + arr.length, 0));
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
  freeDCtx(dctx) {
    if (!this._exports)
      throw new Error("WASM module not initialized");
    return this._exports._ZSTD_freeDCtx(dctx);
  }
  createDDict(dictData) {
    const dictPtr = this._malloc(dictData.length);
    this._HEAPU8.set(dictData, dictPtr);
    return this._exports._ZSTD_createDDict(dictPtr, dictData.length);
  }
  freeDDict(ddict) {
    if (!this._exports)
      throw new Error("WASM module not initialized");
    return this._exports._ZSTD_freeDDict(ddict);
  }
}
var zstd_wasm_default = ZstdDecoder;

// src/decompression-stream.ts
var _NativeDecompressionStream = typeof globalThis !== "undefined" && globalThis.DecompressionStream;

class _DecompressionStream {
  readable;
  writable;
  constructor(format, _ensureInit) {
    if (format !== "zstd") {
      if (_NativeDecompressionStream) {
        const native = new _NativeDecompressionStream(format);
        this.readable = native.readable;
        this.writable = native.writable;
        return;
      } else {
        throw new TypeError(`Unsupported format: ${format} (native DecompressionStream not available)`);
      }
    }
    let decoderInstance = null;
    let isFirstChunk = true;
    const { readable, writable } = new TransformStream({
      async start() {
        decoderInstance = await _ensureInit();
      },
      async transform(chunk, controller) {
        if (!decoderInstance) {
          decoderInstance = await _ensureInit();
        }
        try {
          const result = decoderInstance.decompressStream(chunk, isFirstChunk);
          isFirstChunk = false;
          if (result.buf.length > 0)
            controller.enqueue(result.buf);
        } catch (error) {
          controller.error(new Error(`Zstd decompression failed: ${error}`));
        }
      },
      flush(controller) {
        isFirstChunk = true;
        controller.terminate();
      }
    });
    this.readable = readable;
    this.writable = writable;
  }
}

// src/shared.ts
async function decompress(input, createDecoder) {
  const decoder = await createDecoder();
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return decoder.decompressStream(data, true).buf;
}
async function decompressStream(input, createDecoder, reset = false) {
  const decoder = await createDecoder();
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return decoder.decompressStream(data, reset);
}
async function decompressSync(input, createDecoder, expectedSize) {
  const decoder = await createDecoder();
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return decoder.decompressSync(data, expectedSize);
}

// src/index.web.ts
var wasmModule;
var wasmModuleLoaded = false;
async function _loadWasm() {
  wasmModule = await WebAssembly.compileStreaming(fetch("./zstd-decoder.wasm"));
  wasmModuleLoaded = true;
  return wasmModule;
}
async function _createDecoder(options) {
  const module = wasmModuleLoaded ? wasmModule : await _loadWasm();
  const decoder = new zstd_wasm_default({
    maxSrcSize: 32 * 1024 * 1024,
    maxDstSize: 128 * 1024 * 1024,
    dictionary: options?.dictionary
  });
  await decoder.init(module);
  return decoder;
}

class DecompressionStream extends _DecompressionStream {
  constructor(format) {
    super(format, _createDecoder);
  }
}
var decompress2 = (input, options) => decompress(input, () => _createDecoder(options));
var decompressStream2 = (input, reset = false, options) => decompressStream(input, () => _createDecoder(options), reset);
var decompressSync2 = (input, expectedSize, options) => decompressSync(input, () => _createDecoder(options), expectedSize);
export {
  decompressSync2 as decompressSync,
  decompressStream2 as decompressStream,
  decompress2 as decompress,
  zstd_wasm_default as ZstdDecoder,
  DecompressionStream
};
