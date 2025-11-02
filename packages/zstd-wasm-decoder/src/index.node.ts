import { _internal } from './shared.js';
import { readFileSync } from 'fs';

export { 
  ZstdDecoder,
  createDecoder,
  ZstdDecompressionStream,
  decompress,
  decompressStream,
  decompressSync
} from './shared.js';

export type { DecoderOptions, StreamResult } from './types.js';

_internal._loader = () => {
  const wasmUrl = new URL('./zstd-decoder-perf.wasm', import.meta.url);
  return new WebAssembly.Module(readFileSync(wasmUrl));
};