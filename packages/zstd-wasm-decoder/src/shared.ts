import ZstdDecoder from './zstd-wasm.js';
export { default as ZstdDecoder, _MAX_SRC_BUF } from './zstd-wasm.js';

import type { StreamResult, ZstdOptions } from './types.js';
import { rzfh, type DZS, err, _concatUint8Arrays } from './utils.js';

export const _internal = {
  _loader: null as ((wasmPath?: string) => WebAssembly.Module | Promise<WebAssembly.Module>) | null,
  buffer: {
    maxSrcSize: 0,
    maxDstSize: 0,
  },
  dictionaries: [] as string[],
};

// This is horrible tbh.
const decoderPools = new Map<number, Map<number, ZstdDecoder>>();
const poolLocks = new Map<number, boolean[]>();


let isInitialized = false;
let cachedModule: WebAssembly.Module;

const loadedDictionaries = new Map<number, Uint8Array>();

function /*! @__PURE__ */ _createDecoderInstance(
  dictionary?: Uint8Array | ArrayBuffer,
): ZstdDecoder {
  const dict =
    dictionary instanceof Uint8Array
      ? dictionary
      : dictionary instanceof ArrayBuffer
        ? new Uint8Array(dictionary)
        : undefined;

  const decoder = new ZstdDecoder({ ..._internal.buffer, dictionary: dict });
  decoder.init(cachedModule);
  return decoder;
}

/**
 * Configure global decoder settings.
 * 
 * @param options - Configuration options
 * @param options.maxSrcSize - Maximum compressed input size in bytes
 * @param options.maxDstSize - Maximum decompressed output size in bytes  
 * @param options.dictionaries - Array of dictionary URLs or data URIs to preload
 */
export const setupZstdDecoder = /*! @__PURE__ */ async (options: {
  maxSrcSize?: number;
  maxDstSize?: number;
  dictionaries?: string[];
}) => {
  if (options.maxSrcSize) _internal.buffer.maxSrcSize = options.maxSrcSize;
  if (options.maxDstSize) _internal.buffer.maxDstSize = options.maxDstSize;

  if (options.dictionaries) {
    for (const url of options.dictionaries) {
      const dict = await _loadResource(url);
      const id = _getDictId(dict);
      if (id > 0) loadedDictionaries.set(id, dict);
    }
  }
};

async function _acquireDecoder(
  dictId: number = 0,
  options?: ZstdOptions,
): Promise<[ZstdDecoder, number, number]> {
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
  
  for (let i = 0; i < locks.length; ++i) {
    if (!locks[i]) {
      locks[i] = true;
      return [pool.get(i)!, i, dictId];
    }
  }

  const decoder = _createDecoderInstance(
    dictId > 0 ? options?.dictionary || loadedDictionaries.get(dictId) : undefined,
  );

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

export function _pushToPool(
  decoder: ZstdDecoder,
  module: WebAssembly.Module,
  dictId: number = 0,
): void {
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
const _loadResource = /*! @__PURE__ */ async (
  resource: Uint8Array | ArrayBuffer | Request | string,
): Promise<Uint8Array> => {
  if (resource instanceof Uint8Array) return resource;
  if (resource instanceof ArrayBuffer) return new Uint8Array(resource);
  const response = await fetch(resource);
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Get dictionary ID from frame header
 */
const _getDictId = /*! @__PURE__ */ (input: Uint8Array): number => {
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
export const createDecoder = /*! @__PURE__ */ async (
  options: ZstdOptions = {},
): Promise<ZstdDecoder> => {
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
 * A {@link ReadableStream}/{@link WritableStream} Web Streams API transformer for Zstandard decompression.
 * 
 * This streaming decompression class allows processing ZSTD-compressed data supplied in chunks,
 * e.g., from a network source, as it arrives. This is useful for situations where you don't have 
 * the entire compressed buffer in advance, e.g., long-running network requests.
 *
 * Each chunk written to the writable end is decompressed
 * and delivered as a Uint8Array from the readable end.
 * 
 * The transform automatically buffers input until
 * enough data is available to read the ZSTD frame header,
 * at which point it allocates decoding resources and begins decompressing.
 * 
 * The stream will acquire and manage decoders transparently.
 * When the stream is closed, it will release or destroy decoding resources as appropriate.
 *
 * @example
 * ```ts
 * const ds = new ZstdDecompressionStream();
 * const response = await fetch('/file.zst');
 * const decompressedStream = response.body.pipeThrough(ds);
 * ```
 *
 * @see {@link ReadableStream}
 * @see {@link WritableStream}
 * @see {@link decompressStream}
 */
export class ZstdDecompressionStream {
  /**
   * The resulting decompressed stream to read output from.
   * @type {ReadableStream<Uint8Array>}
   */
  readonly readable: ReadableStream;
  /**
   * The writable end of the stream to pipe compressed chunks into.
   * @type {WritableStream<BufferSource>}
   */
  readonly writable: WritableStream;

  /**
   * @param {ZstdOptions} [options] - Optional decoder configuration.
   */
  constructor(options?: ZstdOptions) {
    let decoder: ZstdDecoder;
    let idx: number = -1;
    let dictId: number = 0;
    let isFirstChunk = true;
    // A temporary buffer to hold data until the header can be read.
    const initialBuffer: Uint8Array[] = [];
    let headerInfo: DZS = { d: 0, u: 0, e: -1 };
    let bytesRead: number = 0;
    let bytesWritten: number = 0;
    let bufLen: number = 0;
    let minRecvSize: number = 262144;

    const { readable, writable } = new TransformStream<BufferSource, Uint8Array>({
      /**
       * Transforms incoming compressed chunks into decompressed output chunks.
       * @param {BufferSource} chunk - The incoming compressed data chunk.
       * @param {TransformStreamDefaultController<Uint8Array>} controller - Stream controller to enqueue output.
       */
      async transform(
        chunk: BufferSource,
        controller: TransformStreamDefaultController<Uint8Array>,
      ) {
        const data = _toUint8Array(chunk);
        bytesRead += data.length;
        initialBuffer.push(data);
        ++bufLen;
        // Wait until we have at least enough bytes for a full frame header.
        if (bytesRead < 12) {
          return;
        } else if (headerInfo.e == -1) {
          // Gather all data so far for actual header probing.
          const headerBuffer = new Uint8Array(bytesRead);
          let offset = 0;
          for (let i = 0; i < bufLen; ++i) {
            headerBuffer.set(initialBuffer[i], offset);
            offset += initialBuffer[i].length;
          }
          headerInfo = rzfh(headerBuffer) as DZS;
          // Adapt minimum receive size depending on header
          minRecvSize = Math.max(minRecvSize, headerInfo.e, headerInfo.u >> 4, 1 << 17);
        }
        if (bytesRead < minRecvSize || headerInfo.e == -1) return;

        // After header probing, start streaming/decoding.
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
          bytesWritten += result.length;
          controller.enqueue(result);
          isFirstChunk = false;
        } catch (er) {
          controller.error(new err(`dec err ${er}`));
        }
      },

      /**
       * - Called when all input is written.
       * - Ensures all remaining data is flushed through the decoder.
       * - Releases decoder resources.
       * @param {TransformStreamDefaultController<Uint8Array>} controller 
       */
      async flush(controller: TransformStreamDefaultController<Uint8Array>) {
        if (bytesWritten == 0 && bytesRead > 6) {
          try {
            const res = await decompressStream(
              _concatUint8Arrays(initialBuffer, bytesRead),
              true,
              options,
            );
            controller.enqueue(res.buf);
          } catch (er) {
            controller.error(new err(`dec err ${er}`));
          }
        } else {
          if (idx == -1) {
            decoder?._destroy();
          } else {
            _releaseDecoder(idx, dictId);
          }
        }
        controller.terminate();
      },
    });

    this.readable = readable;
    this.writable = writable;
  }
}

/**
 * Decompress a Zstandard-compressed buffer into a Uint8Array.
 * 
 * This is a convenient, Promise-based wrapper for decompressing
 * an entire compressed buffer at once. A convenience for drop-in
 * replacements.
 *
 * Internally, this calls {@link decompressStream} and returns only `.buf`.
 *
 * @param {Uint8Array} input - The compressed Zstandard data.
 * @param {ZstdOptions} [options] - Optional decompression options.
 * @returns {Promise<Uint8Array>} Resolves with the decompressed buffer.
 *
 * @example
 * const decompressed = await decompress(compressedData);
 *
 * @see decompressStream
 */
export const decompress = /*! @__PURE__ */ async (
  input: Uint8Array,
  options?: ZstdOptions,
): Promise<Uint8Array> => {
  return (await decompressStream(input, true, options)).buf;
};

/**
 * Decompresses a Zstandard-compressed buffer into a {@link StreamResult}.
 *
 * Use this function when the entire input is already fully available in memory,
 * or if you want to decompress large data while still giving the main thread
 * some breathing room.
 *
 * This function is suitable for decompressing data that exceeds
 * what can fit in static in/out buffers.
 * 
 * Note: This is not an incremental streaming API
 * see {@link ZstdDecompressionStream} for streaming input.
 *
 * @param {Uint8Array} input - The compressed Zstandard data.
 * @param {boolean} [reset=false] - Whether to reset the decoder context before decompression (default: false).
 * @param {ZstdOptions} [options] - Optional decompression options (e.g., dictionary).
 * @returns {Promise<StreamResult>} Resolves with the decompressed output and number of input bytes consumed.
 *
 * @example
 * const result = await decompressStream(compressedData, true);
 * // result.buf contains the decompressed output
 * // result.in_offset contains the number of input bytes consumed
 *
 * @see ZstdDecompressionStream
 */
export const decompressStream = /*! @__PURE__ */ async (
  input: Uint8Array,
  reset = false,
  options?: ZstdOptions,
): Promise<StreamResult> => {
  const dictId = _getDictId(input);
  const [decoder, idx] = await _acquireDecoder(dictId, options);
  const result = decoder.decompressStream(input, reset);
  idx == -1 ? decoder._destroy() : _releaseDecoder(idx, dictId);
  return result;
};

/**
 * Decompress a Zstandard-compressed buffer synchronously.
 *
 * This function provides fast synchronous decompression. If the expected size
 * is not provided, it will be read from the frame header. For data that exceeds
 * internal buffer limits, this automatically falls back to streaming decompression.
 *
 * @param {Uint8Array} input - The compressed Zstandard data.
 * @param {number} [expectedSize] - Optional expected size of the decompressed output, in bytes.
 * @param {ZstdOptions} [options] - Optional decompression options (e.g., dictionary).
 * @returns {Uint8Array} The decompressed output buffer.
 *
 * @example
 * const decompressed = decompressSync(compressedData, 123456);
 * // or without expectedSize:
 * const decompressed = decompressSync(compressedData);
 */
export const decompressSync = /*! @__PURE__ */ (
  input: Uint8Array,
  expectedSize?: number,
  options?: ZstdOptions,
): Uint8Array => {
  const dictId = _getDictId(input);
  const decoder = decoderPools.get(dictId)?.get(0) || _createDecoderInstance(dictId > 0 ? options?.dictionary || loadedDictionaries.get(dictId) : undefined);
  const result = decoder.decompressSync(input, expectedSize);
  return result;
};
