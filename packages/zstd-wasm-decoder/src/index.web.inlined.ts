/**
 * Zstd WASM Decoder - Inlined WASM variant
 * 
 * WASM is pre-compressed with deflate-raw compliant zopfli stream, encoded as base64,
 * then decompressed at runtime using DecompressionStreams API
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

// ? (Uint8Array as any).fromBase64(WASM_BASE64) too new
_internal._loader = async () => {
  return await WebAssembly.compile(await new Response(
    new Blob([
      new TextEncoder().encode(atob(WASM_BASE64)).buffer
    ]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
  ).arrayBuffer());
};
const WASM_BASE64 = '__WASM_BASE64_PLACEHOLDER__';