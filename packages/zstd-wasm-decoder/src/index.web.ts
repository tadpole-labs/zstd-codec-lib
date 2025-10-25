import ZstdDecoder from './zstd-wasm.js';
import { _DecompressionStream } from './decompression-stream.js';
import { decompress as _decompress, decompressStream as _decompressStream, decompressSync as _decompressSync } from './shared.js';

let wasmModule: WebAssembly.Module;
let wasmModuleLoaded = false;

/**
 * Load and compile the WASM module (only once)
 */
async function _loadWasm(): Promise<WebAssembly.Module> {
  wasmModule = await WebAssembly.compileStreaming(
    fetch('./zstd-decoder.wasm')
  );
  wasmModuleLoaded = true;
  return wasmModule;
}

/**
 * Create a new decoder instance for each stream
 */
async function _createDecoder(options?: { dictionary?: Uint8Array }): Promise<ZstdDecoder> {
  const module = wasmModuleLoaded ? wasmModule : await _loadWasm();
  
  const decoder = new ZstdDecoder({
    maxSrcSize: 32 * 1024 * 1024,
    maxDstSize: 128 * 1024 * 1024,
    dictionary: options?.dictionary
  });
  
  await decoder.init(module);
  
  return decoder;
}

/**
 * DecompressionStream wrapper for "zstd" format
 * Each stream gets its own decoder instance
 */
export class DecompressionStream extends _DecompressionStream {
  constructor(format: string) {
    super(format, _createDecoder);
  }
}

export const decompress = (input: Uint8Array | ArrayBuffer, options?: { dictionary?: Uint8Array }) => _decompress(input, () => _createDecoder(options));
export const decompressStream = (input: Uint8Array | ArrayBuffer, reset = false, options?: { dictionary?: Uint8Array }) => _decompressStream(input, () => _createDecoder(options), reset);
export const decompressSync = (input: Uint8Array | ArrayBuffer, expectedSize?: number, options?: { dictionary?: Uint8Array }) => _decompressSync(input, () => _createDecoder(options), expectedSize);

export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
