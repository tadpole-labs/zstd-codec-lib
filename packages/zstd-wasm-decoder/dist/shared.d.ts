import type ZstdDecoder from './zstd-wasm.js';
import type { StreamResult } from './types.js';
export declare function decompress(input: Uint8Array | ArrayBuffer | Buffer, createDecoder: () => Promise<ZstdDecoder>): Promise<Uint8Array>;
export declare function decompressStream(input: Uint8Array | ArrayBuffer | Buffer, createDecoder: () => Promise<ZstdDecoder>, reset?: boolean): Promise<StreamResult>;
export declare function decompressSync(input: Uint8Array | ArrayBuffer | Buffer, createDecoder: () => Promise<ZstdDecoder>, expectedSize?: number): Promise<Uint8Array>;
