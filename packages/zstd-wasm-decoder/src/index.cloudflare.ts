import { _internal, _pushToPool, ZstdDecoder } from './shared.js';
//@ts-expect-error
import wasmModule from './zstd-decoder-perf.wasm';

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

let initialized = false;

/**
 * Example usage:
 *
 * ```js
 * import { ZstdDecompressionStream } from "zstd-decoder/cloudflare";
 *
 * // Fetch a Zstandard-compressed resource from the network
 * const response = await fetch("https://example.com/data.zst");
 *
 * // Pipe through ZstdDecompressionStream and decode as text
 * const stream = response.body
 *   .pipeThrough(new ZstdDecompressionStream())
 *   .pipeThrough(new TextDecoderStream());
 *
 * // Accumulate output
 * const reader = stream.getReader();
 * let result = "";
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   result += value;
 * }
 * console.log(result);
 * ```
 */
_internal._loader = async () => {
  const instance = new WebAssembly.Instance(wasmModule, { env: {} });

  if (!initialized) {
    const decoder = new ZstdDecoder(_internal.buffer);
    decoder._initWithInstance(instance, wasmModule);
    _pushToPool(decoder, wasmModule, 0);
    initialized = true;
  }

  return wasmModule;
};
