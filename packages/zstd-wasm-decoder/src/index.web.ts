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

let wasmModule: WebAssembly.Module | null = null;

WebAssembly.compileStreaming(fetch('./zstd-decoder.wasm')).then(m => wasmModule = m);

_internal.loader = () => {
  if (!wasmModule) throw new Error('WASM not ready');
  return wasmModule;
};
