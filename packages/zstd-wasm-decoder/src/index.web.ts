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

_internal._loader = async (wasmPath?: string) => {
  const wasmUrl = wasmPath || new URL('./zstd-decoder.wasm', import.meta.url).href;
  const response = await fetch(wasmUrl);
  return await WebAssembly.compileStreaming(response);
};
