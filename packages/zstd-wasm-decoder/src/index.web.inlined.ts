/**
 * Zstd WASM Decoder - Inlined WASM variant
 * 
 * WASM is pre-compressed with deflate-raw level 7, encoded as base64,
 * then decompressed at runtime using DecompressionStream
 */

import { _internal } from './shared.js';

export { 
  ZstdDecoder,
  createDecoder,
  DecompressionStream,
  decompress,
  decompressStream,
  decompressSync
} from './shared.js';

export type { DecoderOptions, StreamResult } from './types.js';

const WASM_BASE64 = '__WASM_BASE64_PLACEHOLDER__';
let wasmModule: WebAssembly.Module | null = null;

(async () => {
  const binary = await new Response(
    new Blob([(Uint8Array as any).fromBase64(WASM_BASE64)])
      .stream()
      .pipeThrough(new (globalThis as any).DecompressionStream('deflate-raw'))
  ).arrayBuffer();
  wasmModule = await WebAssembly.compile(binary);
})();

_internal.loader = () => {
  if (!wasmModule) throw new Error('WASM not ready');
  return wasmModule;
};