import ZstdDecoder from './zstd-wasm.js';
export { default as ZstdDecoder, _MAX_SRC_BUF } from './zstd-wasm.js';


import type { StreamResult, ZstdOptions } from './types.js';
import { rzfh, DZS, err } from './utils.js';

export const _internal = {
  _loader: null as ((wasmPath?: string) => WebAssembly.Module | Promise<WebAssembly.Module>) | null,
  bufSizes: { 
    maxSrcSize: 0,
    maxDstSize: 0
  },
  dictionaries: [] as string[]
};

// This is horrible tbh.
const decoderPools = new Map<number, Map<number, ZstdDecoder>>();
const poolLocks = new Map<number, boolean[]>();

// Survives hundreds of concurrent promises though without screwing browser mem
// Something that shouldn't normally occur assuming common sense. Still good to know it survies misuse
// Spinning up instances is cheap, but still not too cheap.
// So this is the middle ground. Without overengineering with web workers, another GC layer in JS etc.
// Prolly could get away with just one hot instance. And get rid of the above too.
let isInitialized = false;
let cachedModule: WebAssembly.Module;

const loadedDictionaries = new Map<number, Uint8Array>();

function /* @__PURE__ */ _createDecoderInstance(dictionary?: Uint8Array | ArrayBuffer | Request | string): ZstdDecoder {
  const dict = dictionary instanceof Uint8Array ? dictionary :
               dictionary instanceof ArrayBuffer ? new Uint8Array(dictionary) :
               undefined;
  
  const decoder = new ZstdDecoder({ ..._internal.bufSizes, dictionary: dict });
  decoder.init(cachedModule);
  return decoder;
}

export const setupZstdDecoder = /* @__PURE__ */ async (options: {
  maxSrcSize?: number;
  maxDstSize?: number;
  dictionaries?: string[];  // URLs or data:uris
}) => {
  if (options.maxSrcSize) _internal.bufSizes.maxSrcSize = options.maxSrcSize;
  if (options.maxDstSize) _internal.bufSizes.maxDstSize = options.maxDstSize;
  
  if (options.dictionaries) {
    for (const url of options.dictionaries) {
      const dict = await loadResource(url);
      const id = _getDictId(dict);
      if (id > 0) loadedDictionaries.set(id, dict);
    }
  }
};

export function _concatUint8Arrays(arrays: Uint8Array[], ol: number): Uint8Array {
  if (arrays.length == 1) return arrays[0];
  const buf = new Uint8Array(ol);
  for (let i = 0, b = 0; i < arrays.length; ++i) {
    const chk = arrays[i];
    buf.set(chk, b);
    b += chk.length;
  }
  return buf;
}

async function _acquireDecoder(dictId: number = 0, options?: ZstdOptions): Promise<[ZstdDecoder, number, number]> {
  if (!cachedModule) {
    const module = _internal._loader!();
    cachedModule = module instanceof Promise ? await module : module;
  }

  if (!decoderPools.has(dictId)) {
    decoderPools.set(dictId, new Map());
    poolLocks.set(dictId, []);
  }
  
  const pool = decoderPools.get(dictId)!;
  const locks = poolLocks.get(dictId)!;
  
  // 
  for (let i = 0; i < locks.length; ++i) {
    if (!locks[i]) {
      locks[i] = true;
      return [pool.get(i)!, i, dictId];
    }
  }

  const decoder = _createDecoderInstance(dictId > 0 ? (options?.dictionary || loadedDictionaries.get(dictId)) : undefined);
  
  if (locks.length > 1) return [decoder, -1, dictId];
  
  const newIdx = locks.length;
  pool.set(newIdx, decoder);
  locks.push(true);
  return [decoder, newIdx, dictId];
}

function _releaseDecoder(idx: number, dictId: number): void {
  const locks = poolLocks.get(dictId);
  if (locks) locks[idx] = false;
}

export function _pushToPool(decoder: ZstdDecoder, module: WebAssembly.Module, dictId: number = 0): void {
  cachedModule = module;
  if (!decoderPools.has(dictId)) {
    decoderPools.set(dictId, new Map());
    poolLocks.set(dictId, []);
  }
  const pool = decoderPools.get(dictId)!;
  const locks = poolLocks.get(dictId)!;
  pool.set(locks.length, decoder);
  locks.push(false);
}

/**
 * Load resource as Uint8Array
 */
const loadResource = /* @__PURE__ */ async (resource: Uint8Array | ArrayBuffer | Request | string): Promise<Uint8Array> => {
  if (resource instanceof Uint8Array) return resource;
  if (resource instanceof ArrayBuffer) return new Uint8Array(resource);
  const response = await fetch(resource);
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Get dictionary ID from frame header
 */
const _getDictId = /* @__PURE__ */ (input: Uint8Array): number => {
  if (input.length < 6) return 0;
  try {
    const header = rzfh(input);
    const id = typeof header == 'object' ? header.d : 0;
    if (id > 0) loadedDictionaries.set(id, input);
    return id;
  } catch {
    return 0;
  }
};

/**
 * Create a decoder instance
 */
export const createDecoder = /* @__PURE__ */ async (options: ZstdOptions = {}): Promise<ZstdDecoder> => {
  if (!isInitialized) {
    cachedModule = await _internal._loader!(options.wasmPath);
    isInitialized = true;
  }
  return _createDecoderInstance(options.dictionary);
};

/**
 * Convert BufferSource to Uint8Array
 */
const _toUint8Array = (chunk: BufferSource): Uint8Array => {
  if (chunk instanceof Uint8Array) return chunk;
  if (ArrayBuffer.isView(chunk))
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return new Uint8Array(chunk as ArrayBuffer);
};


/**
 * ZstdDecompressionStream
 * 
 * Use this, when the input that is being fed in, is not available at invocation time.
 * e.g. when performing network requests where incoming data is buffered over time.
 */
export class ZstdDecompressionStream {
  readonly readable: ReadableStream;
  readonly writable: WritableStream;

  constructor(options?: ZstdOptions) {
    let decoder: ZstdDecoder;
    let idx: number = -1;
    let dictId: number = 0;
    let isFirstChunk = true;
    // A temporary buffer to hold data until the header can be read.
    let initialBuffer: Uint8Array[] = [];
    let headerInfo: DZS = { d: 0, u: 0, e: -1 };
    let bytesRead: number = 0
    let bytesWritten: number = 0
    let bufLen: number = 0
    let minRecvSize: number = 262144

    const { readable, writable } = new TransformStream<BufferSource, Uint8Array>({
      async transform(chunk: BufferSource, controller: TransformStreamDefaultController<Uint8Array>) {
        const data = _toUint8Array(chunk)
        bytesRead += data.length
        initialBuffer.push(data)
        ++bufLen;
        if(bytesRead < 12) {
          return;
        } else if(headerInfo.e == -1) {
          const headerBuffer = new Uint8Array(bytesRead);
          let offset = 0;
          for (let i = 0; i < bufLen; ++i) {
            headerBuffer.set(initialBuffer[i], offset);
            offset += initialBuffer[i].length;
          }
          headerInfo = rzfh(headerBuffer) as DZS;
          minRecvSize = Math.max(minRecvSize, headerInfo.e, Math.max(headerInfo.u>>4, 1<<17))
        }
        if(bytesRead < minRecvSize || headerInfo.e == -1 ) return;
        
        if (decoder) {
          const result = decoder.decompressStream(data, false).buf;
          if (result.length > 0) {
            controller.enqueue(result);
          }
          return;
        }
        
        try {
          if (isFirstChunk) {
            dictId = _getDictId(data);
            [decoder, idx, dictId] = await _acquireDecoder(dictId, options);
          }
          
          const result = decoder!.decompressStream(data, isFirstChunk).buf;
          bytesWritten += result.length
          controller.enqueue(result);
          isFirstChunk = false;
        } catch (er) {
          controller.error(new err(`dec err ${er}`));
        }
      },

      async flush(controller: TransformStreamDefaultController<Uint8Array>) {
        if(bytesWritten == 0 && bytesRead > 6) {
          try {
            const res = await decompressStream(_concatUint8Arrays(initialBuffer, bytesRead), true, options);
            controller.enqueue(res.buf);
          } catch (er) {
            controller.error(new err(`dec err ${er}`));
          }
        } else {
          if(idx == -1) {
            decoder?.destroy();
          } else {
            _releaseDecoder(idx, dictId);
          }
        }
        controller.terminate();
      }
    });

    this.readable = readable;
    this.writable = writable;
  }
}

/**
 * Convinience wrapper for drop-in replacement of other libraries.
 * (Proxies to decompressStream and returns the buf)
 */
export const decompress = /* @__PURE__ */ async (
  input: Uint8Array,
  options?: ZstdOptions
): Promise<Uint8Array> => {
  return (await decompressStream(input, true, options)).buf;
};

/**
 * Decompress stream for data larger than what fits into statically allocated in and out buffers.
 * 
 * Use this function when the entire input is already fully available at invocation and/or
 * if you do not want to stall the main thread when decompressing lots of data.
 * 
 * Using this does not imply an incremental feed of data chunks, for which
 * ZstdDecompressionStream is the suitable alternative when the input is inconsistent and not available
 * at function invocation.
 */
export const decompressStream = /* @__PURE__ */ async (
  input: Uint8Array,
  reset = false,
  options?: ZstdOptions
): Promise<StreamResult> => {
  const dictId = _getDictId(input);
  const [decoder, idx] = await _acquireDecoder(dictId, options);
  const result = decoder.decompressStream(input, reset);
  idx == -1 ? decoder.destroy() : _releaseDecoder(idx, dictId);
  return result;
};

/**
 * Decompress data synchronously (when expected size is known and is within limits)
 */
export const decompressSync = /* @__PURE__ */ async (
  input: Uint8Array,
  expectedSize?: number,
  options?: ZstdOptions
): Promise<Uint8Array> => {
  const dictId = _getDictId(input);
  const [decoder, idx] = await _acquireDecoder(dictId, options);
  const result = decoder.decompressSync(input, expectedSize);
  idx == -1 ? decoder.destroy() : _releaseDecoder(idx, dictId);
  return result;
};
