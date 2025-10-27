/**
 * Zstd WASM Decoder - Inlined WASM variant
 *
 * WASM is pre-compressed with deflate-raw level 7, encoded as base64,
 * then decompressed at runtime using DecompressionStream
 */
export { ZstdDecoder, createDecoder, DecompressionStream, decompress, decompressStream, decompressSync } from './shared.js';
export type { DecoderOptions, StreamResult } from './types.js';
//# sourceMappingURL=index.web.inlined.d.ts.map