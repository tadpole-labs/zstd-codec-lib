import { Buffer } from 'node:buffer';

import { decompress, createDecoder } from '../../packages/zstd-wasm-decoder/src/_esm/index.node.js';
import type { ZstdOptions, ZstdDecoder } from '../../packages/zstd-wasm-decoder/src/types.js';

export interface WasmDecoderAdapter {
  decompress(data: Buffer | Uint8Array, options?: ZstdOptions): Promise<Buffer>;
  decompressAsync(data: Buffer | Uint8Array, options?: ZstdOptions): Promise<Buffer>;
}

export const wasmAdapter: WasmDecoderAdapter = {
  async decompress(data: Buffer | Uint8Array, options = {}): Promise<Buffer> {
    const result = await decompress(data, options);
    return Buffer.from(result);
  },
  
  async decompressAsync(data: Buffer | Uint8Array, options = {}): Promise<Buffer> {
    const result = await decompress(data, options);
    return Buffer.from(result);
  }
};

export const wasmDecoder = {
  async init(dictionary: Buffer | Uint8Array | null = null): Promise<ZstdDecoder> {
    return await createDecoder({ dictionary: dictionary || undefined });
  },
  
  decompressStream(decoder: ZstdDecoder, compressed: Buffer, numChunks: number, isFirst = true): Buffer {
    const outputChunks: Buffer[] = [];
    const chunkSize = Math.ceil(compressed.length / numChunks);
    
    for (let i = 0; i < numChunks; i++) {
      const offset = i * chunkSize;
      if (offset >= compressed.length) break;
      const result = decoder.decompressStream(
        compressed.slice(offset, Math.min(offset + chunkSize, compressed.length)), 
        i === 0 && isFirst
      );
      if (result?.buf?.length > 0) outputChunks.push(Buffer.from(result.buf));
    }
    
    return Buffer.concat(outputChunks);
  }
};

export async function initWasmAdapter(dictionaries: Record<string, Buffer | Uint8Array> = {}): Promise<void> {
  await createDecoder();
}

