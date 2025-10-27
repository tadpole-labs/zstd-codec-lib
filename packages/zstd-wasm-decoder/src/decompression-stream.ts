/**
 * DecompressionStream polyfill that extends native support with "zstd" format
 * 
 * https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream
 */

import type ZstdDecoder from './zstd-wasm.js';

// Polyfill
const _NativeDecompressionStream = typeof globalThis !== 'undefined' && 
  (globalThis as any).DecompressionStream;

/**
 * DecompressionStream that supports both native formats and "zstd"
 * Usage: 
 *   - new DecompressionStream("gzip")  -> native browser API
 *   - new DecompressionStream("zstd")  -> polyfilled WASM module
 */
export class _DecompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  
  constructor(format: string, _ensureInit: () => Promise<ZstdDecoder>) {
    if (format !== 'zstd') {
      if (_NativeDecompressionStream) {
        const native = new _NativeDecompressionStream(format);
        this.readable = native.readable;
        this.writable = native.writable;
        return;
      } else {
        throw new TypeError(`${format} not available`);
      }
    }
    
    let decoderInstance: ZstdDecoder | null = null;
    let isFirstChunk = true;
    
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      async start() {
        decoderInstance = await _ensureInit();
      },
      
      async transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
        if (!decoderInstance) {
          decoderInstance = await _ensureInit();
        }
        
        try {
          const result = decoderInstance.decompressStream(chunk, isFirstChunk);
          isFirstChunk = false;
          
          if (result.buf.length > 0) controller.enqueue(result.buf);
        } catch (error) {
          controller.error(new Error(`decomp err ${error}`));
        }
      },
      
      flush(controller: TransformStreamDefaultController<Uint8Array>) {
        controller.terminate();
      }
    });
    
    this.readable = readable;
    this.writable = writable;
  }
}
