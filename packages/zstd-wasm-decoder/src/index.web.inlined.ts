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
  ZstdDecompressionStream,
  decompress,
  decompressStream,
  decompressSync
} from './shared.js';

export type { DecoderOptions, StreamResult } from './types.js';

const WASM_BASE64 = '__WASM_BASE64_PLACEHOLDER__';

const b64atob = (b64: string) => new TextEncoder().encode(atob(b64)).buffer;

_internal._loader = async () => {
  const wasmData = typeof (Uint8Array as any).fromBase64 === 'function'
    ? (Uint8Array as any).fromBase64(WASM_BASE64)
    : b64atob(WASM_BASE64);
  
  const binary = await new Response(
    new Blob([wasmData])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
  ).arrayBuffer();
  return await WebAssembly.compile(binary);
};