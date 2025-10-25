import ZstdDecoder from './zstd-wasm.js';
export declare function createDecoder(options?: {
    wasmPath?: string;
    dictionary?: Uint8Array | Buffer;
}): Promise<ZstdDecoder>;
export declare const decompress: (input: Uint8Array | Buffer, options?: {
    dictionary?: Uint8Array | Buffer;
}) => Promise<Uint8Array>;
export declare const decompressStream: (input: Uint8Array | Buffer, reset?: boolean, options?: {
    dictionary?: Uint8Array | Buffer;
}) => Promise<import("./types.js").StreamResult>;
export declare const decompressSync: (input: Uint8Array | Buffer, expectedSize?: number, options?: {
    dictionary?: Uint8Array | Buffer;
}) => Promise<Uint8Array>;
export { ZstdDecoder };
export type { DecoderOptions, StreamResult } from './types.js';
declare const _default: {
    createDecoder: typeof createDecoder;
    decompress: (input: Uint8Array | Buffer, options?: {
        dictionary?: Uint8Array | Buffer;
    }) => Promise<Uint8Array>;
    decompressSync: (input: Uint8Array | Buffer, expectedSize?: number, options?: {
        dictionary?: Uint8Array | Buffer;
    }) => Promise<Uint8Array>;
    decompressStream: (input: Uint8Array | Buffer, reset?: boolean, options?: {
        dictionary?: Uint8Array | Buffer;
    }) => Promise<import("./types.js").StreamResult>;
};
export default _default;
