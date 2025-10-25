import ZstdDecoder from './zstd-wasm.js';
import { decompress as _decompress, decompressStream as _decompressStream, decompressSync as _decompressSync } from './shared.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let wasmModule: WebAssembly.Module;
let wasmModuleLoaded = false;

let decoder: ZstdDecoder | null = null;

/**
 * Load and compile WASM module (only once)
 */
async function loadWasmModule(wasmPath?: string): Promise<WebAssembly.Module> {
  const path = wasmPath || join(__dirname, 'zstd-decoder.wasm');
  const wasmBinary = readFileSync(path);
  wasmModule = await WebAssembly.compile(wasmBinary);
  wasmModuleLoaded = true;
  return wasmModule;
}

/**
 * Create a new decoder instance
 */
async function _createDecoder(options?: { wasmPath?: string; dictionary?: Uint8Array | Buffer }): Promise<ZstdDecoder> {
  const d = new ZstdDecoder({
    maxSrcSize: 128 * 1024 * 1024,
    maxDstSize: 512 * 1024 * 1024,
    dictionary: options?.dictionary
  });

  const module = wasmModuleLoaded ? wasmModule : await loadWasmModule(options?.wasmPath);
  
  await d.init(module);
  return d;
}

export async function createDecoder(options?: { wasmPath?: string; dictionary?: Uint8Array | Buffer }): Promise<ZstdDecoder> {
  if (decoder) return decoder;
  decoder = await _createDecoder(options);
  return decoder;
}

export const decompress = (input: Uint8Array | Buffer, options?: { dictionary?: Uint8Array | Buffer }) => _decompress(input, () => _createDecoder(options));
export const decompressStream = (input: Uint8Array | Buffer, reset = false, options?: { dictionary?: Uint8Array | Buffer }) => _decompressStream(input, () => _createDecoder(options), reset);
export const decompressSync = (input: Uint8Array | Buffer, expectedSize?: number, options?: { dictionary?: Uint8Array | Buffer }) => _decompressSync(input, () => _createDecoder(options), expectedSize);

export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
export default { createDecoder, decompress, decompressSync, decompressStream };
