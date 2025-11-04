import { _internal, _pushToPool, ZstdDecoder } from './shared.js';
//@ts-expect-error
import wasmModule from './zstd-decoder-perf.wasm';

export { 
  ZstdDecoder,
  createDecoder,
  ZstdDecompressionStream,
  decompress,
  decompressStream,
  decompressSync
} from './shared.js';

export type { DecoderOptions, StreamResult } from './types.js';

let initialized = false;

_internal._loader = async () => {
  const instance = new WebAssembly.Instance(wasmModule, { env: {} });
  
  if (!initialized) {
    const decoder = new ZstdDecoder(_internal.bufSizes);
    decoder._initWithInstance(instance, wasmModule);
    _pushToPool(decoder, wasmModule, 0);
    initialized = true;
  }
  
  return wasmModule;
};

