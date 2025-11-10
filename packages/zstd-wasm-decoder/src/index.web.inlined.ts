/**
 * Zstd WASM Decoder - Inlined WASM variant
 *
 * WASM is pre-compressed with deflate-raw compliant zopfli stream, encoded as base64,
 * then decompressed at runtime using DecompressionStreams API
 */

import { _internal } from './shared.js';

// biome-ignore lint/performance/noBarrelFile: entrypoint module
export {
  createDecoder,
  decompress,
  decompressStream,
  decompressSync,
  ZstdDecoder,
  ZstdDecompressionStream,
} from './shared.js';

export type { DecoderOptions, StreamResult } from './types.js';

_internal._loader = async () => {
  return await WebAssembly.compile(
    await new Response(
      new Blob([
        typeof (Uint8Array as any).fromBase64 === 'function'
          ? (Uint8Array as any).fromBase64(WASM_BASE64)
          : new TextEncoder().encode(atob(WASM_BASE64)).buffer,
      ])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw')),
    ).arrayBuffer(),
  );
};
const WASM_BASE64 = '__WASM_BASE64_PLACEHOLDER__';
