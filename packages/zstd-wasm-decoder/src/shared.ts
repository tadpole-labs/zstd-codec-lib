import type ZstdDecoder from './zstd-wasm.js';
import type { StreamResult } from './types.js';


export async function decompress(
  input: Uint8Array | ArrayBuffer | Buffer,
  createDecoder: () => Promise<ZstdDecoder>
): Promise<Uint8Array> {
  const decoder = await createDecoder();
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return decoder.decompressStream(data, true).buf;
}


export async function decompressStream(
  input: Uint8Array | ArrayBuffer | Buffer,
  createDecoder: () => Promise<ZstdDecoder>,
  reset = false
): Promise<StreamResult> {
  const decoder = await createDecoder();
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return decoder.decompressStream(data, reset);
}


export async function decompressSync(
  input: Uint8Array | ArrayBuffer | Buffer,
  createDecoder: () => Promise<ZstdDecoder>,
  expectedSize?: number
): Promise<Uint8Array> {
  const decoder = await createDecoder();
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return decoder.decompressSync(data, expectedSize);
}
