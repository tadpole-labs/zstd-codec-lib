import { Buffer } from 'node:buffer';

import { decompress, createDecoder } from '../../packages/zstd-wasm-decoder/dist/index.node.js';

interface DecompressionOptions {
  dictionary?: Buffer | Uint8Array;
}

export interface WasmDecoderAdapter {
  decompress(data: Buffer | Uint8Array, options?: DecompressionOptions): Promise<Buffer>;
  decompressAsync(data: Buffer | Uint8Array, options?: DecompressionOptions): Promise<Buffer>;
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
  async init(dictionary: Buffer | Uint8Array | null = null) {
    return await createDecoder({ dictionary: dictionary || undefined });
  },
  
  decompressStream(decoder: any, compressed: Buffer, numChunks: number, isFirst = true): Buffer {
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

