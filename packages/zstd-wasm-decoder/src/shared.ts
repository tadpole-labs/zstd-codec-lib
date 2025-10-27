import ZstdDecoder from './zstd-wasm.js';
import { _DecompressionStream } from './decompression-stream.js';
import type { StreamResult } from './types.js';

export { default as ZstdDecoder } from './zstd-wasm.js';
export type { DecoderOptions, StreamResult } from './types.js';

/**
 * Options for decoder functions
 */
interface CreateDecoderOptions {
  dictionary?: Uint8Array | ArrayBuffer | Request | string;
  wasmPath?: string;
}

// WASM loader - assigned by each entry point
export const _internal = {
  loader: null as ((wasmPath?: string) => WebAssembly.Module) | null
};

let decoder: ZstdDecoder;
let isInitialized = false;

// Default buffer sizes
const defaultBufferSizes = { 
  maxSrcSize: 64 * 1024 * 1024,    // 64MB
  maxDstSize: 128 * 1024 * 1024    // 128MB
};

/**
 * Load resource as Uint8Array (handles all input types)
 */
async function loadResource(resource: Uint8Array | ArrayBuffer | Request | string): Promise<Uint8Array> {
  if (resource instanceof Uint8Array) return resource;
  if (resource instanceof ArrayBuffer) return new Uint8Array(resource);
  const response = await fetch(resource);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Create a decoder instance
 */
export function createDecoder(options: CreateDecoderOptions = {}) {
  if (!_internal.loader) throw new Error('WASM loader not configured');
  const module = _internal.loader(options.wasmPath);
  decoder = new ZstdDecoder({
    maxSrcSize: defaultBufferSizes.maxSrcSize,
    maxDstSize: defaultBufferSizes.maxDstSize,
    dictionary: options.dictionary instanceof Uint8Array ? options.dictionary :
                options.dictionary instanceof ArrayBuffer ? new Uint8Array(options.dictionary) :
                undefined
  });
  decoder.init(module);
  isInitialized = true;
  return decoder;
}

/**
 * DecompressionStream supporting whatwg standards and zstd
 */
export class DecompressionStream extends _DecompressionStream {
  constructor(format: string, options?: CreateDecoderOptions) {
    super(format, async () => {
      if (!_internal.loader) throw new Error('WASM loader not configured');
      const module = _internal.loader(options?.wasmPath);
      const dict = options?.dictionary ? await loadResource(options.dictionary) : undefined;
      
      const streamDecoder = new ZstdDecoder({
        maxSrcSize: defaultBufferSizes.maxSrcSize,
        maxDstSize: defaultBufferSizes.maxDstSize,
        dictionary: dict
      });
      streamDecoder.init(module);
      return streamDecoder;
    });
  }
}

/**
 * Decompress data completely
 */
export function decompress(
  input: Uint8Array,
  options?: CreateDecoderOptions
): Uint8Array {
  if (!isInitialized) createDecoder(options);
  return decoder.decompressStream(input, true).buf;
}

/**
 * Decompress data as a stream (for chunked processing)
 */
export function decompressStream(
  input: Uint8Array,
  reset = false,
  options?: CreateDecoderOptions
): StreamResult {
  if (!isInitialized) createDecoder(options);
  return decoder.decompressStream(input, reset);
}

/**
 * Decompress data synchronously (when expected size is known)
 */
export function decompressSync(
  input: Uint8Array,
  expectedSize?: number,
  options?: CreateDecoderOptions
): Uint8Array {
  if (!isInitialized) createDecoder(options);
  return decoder.decompressSync(input, expectedSize);
}
