/**
 * Zstd WASM Decoder - Inlined WASM variant
 * 
 * WASM is pre-compressed with deflate-raw level 7, encoded as base64,
 * then decompressed at runtime using DecompressionStream
 */

import ZstdDecoder from './zstd-wasm.js';
import { _DecompressionStream } from './decompression-stream.js';
import { decompress as _decompress, decompressStream as _decompressStream, decompressSync as _decompressSync } from './shared.js';

let wasmModule: WebAssembly.Module;
let wasmModuleLoaded = false;

/**
 * Load, decompress and compile the WASM module (only once)
 */
async function _loadWasm(): Promise<WebAssembly.Module> {
  // Decompress using native DecompressionStream ('deflate-raw')
  const binary = await new Response(
    new Blob([(Uint8Array as any).fromBase64(WASM_BASE64)])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
  ).arrayBuffer();
  
  // Compile the module once
  wasmModule = await WebAssembly.compile(binary);
  wasmModuleLoaded = true;
  return wasmModule;
}

/**
 * Create a new decoder instance for each stream
 */
async function _createDecoder(): Promise<ZstdDecoder> {
  const module = wasmModuleLoaded ? wasmModule : await _loadWasm();
  
  const decoder = new ZstdDecoder({
    maxSrcSize: 32 * 1024 * 1024,  // 32MB
    maxDstSize: 128 * 1024 * 1024  // 128MB
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

export const decompress = (input: Uint8Array | ArrayBuffer) => _decompress(input, _createDecoder);
export const decompressStream = (input: Uint8Array | ArrayBuffer, reset = false) => _decompressStream(input, _createDecoder, reset);
export const decompressSync = (input: Uint8Array | ArrayBuffer, expectedSize?: number) => _decompressSync(input, _createDecoder, expectedSize);

export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';

const WASM_BASE64 = '__WASM_BASE64_PLACEHOLDER__';