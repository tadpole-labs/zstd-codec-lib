import { _internal } from './shared.js';
import { readFileSync } from 'fs';

export { 
  ZstdDecoder,
  createDecoder,
  DecompressionStream,
  decompress,
  decompressStream,
  decompressSync
} from './shared.js';

export type { DecoderOptions, StreamResult } from './types.js';

const wasmUrl = new URL('./zstd-decoder.wasm', import.meta.url);
const wasmModule = new WebAssembly.Module(readFileSync(wasmUrl));

_internal.loader = () => wasmModule;
